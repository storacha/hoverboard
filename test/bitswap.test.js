import { unstable_dev as testWorker } from 'wrangler'
import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identifyService } from 'libp2p/identify'
import { createLibp2p } from 'libp2p'
import { mplex } from '@libp2p/mplex'
import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import { Builder } from './lib/builder.js'
import { createDynamo, createDynamoTable, createS3, createS3Bucket } from './lib/aws.js'
import { peerId } from './fixture/peer.js'
import test from 'ava'
import { ShardingStream, UnixFS } from '@web3-storage/upload-client'
import assert from 'node:assert'

/* global Blob, TransformStream, WritableStream */

/** @type {any[]} */
const workers = []

test.after(_ => {
  workers.forEach(w => w.stop())
})

/**
 * @param {Partial<import('../src/worker.js').Env>} env
 */
async function createWorker (env = {}) {
  const w = await testWorker('src/worker.js', {
    vars: env,
    experimental: {
      disableExperimentalWarning: true
    }
  })
  workers.push(w)
  return w
}

/**
 * @param {object} worker
 * @param {number} worker.port
 * @param {string} worker.address
 */
function getListenAddr ({ port, address }) {
  return multiaddr(`/ip4/${address}/tcp/${port}/ws/p2p/${peerId.id}`)
}

/**
 * - create dag, pack to car, add indexes to dynamo and blocks to s3
 * - start hoverboard worker
 * - start local libp2p node, connect to hoverboard
 * - wrap libp2p in helia, fetch rood cid of dag from helia
 * - assert blocks are in helia, and data round trips
 */
test('helia bitswap', async t => {
  t.timeout(60_000)
  const { expected, libp2p, helia, heliaFs, hoverboard, root } = await createHeliaBitswapScenario()

  console.log(`Dialing ${hoverboard}`)

  const peer = await libp2p.dial(hoverboard)
  t.is(peer.remoteAddr.getPeerId()?.toString(), peerId.id)

  const decoder = new TextDecoder('utf8')
  let text = ''

  console.log(`Fetching ${root}`)
  for await (const chunk of heliaFs.cat(root)) {
    text += decoder.decode(chunk, { stream: true })
  }

  text += decoder.decode()

  t.true(await helia.blockstore.has(root), 'block should now be in helia blockstore')

  t.is(text, expected, 'bitswap roundtrippin')
})

test.skip('helia bitswap + content-claims', async t => {
  const contentA = await createMockClaimableContent(`contentA-${Math.random().toString().slice(2)}`)
  console.log('contentA', {
    ...contentA,
    text: (new TextDecoder()).decode(contentA.buffer)
  })
  const contentClaims = createMockContentClaims([contentA])
  const { libp2p, heliaFs, hoverboard } = await createHeliaBitswapScenario({ contentClaims })
  await libp2p.dial(hoverboard)

  // we should be able to use helia.cat(contentA.unixfsLink) and get blocks that come form contentA.unixfsCar

  // @ts-expect-error unixfsLink type
  const contentACat = await concat(heliaFs.cat(contentA.unixfsLink))
  const contentACatText = await (import('uint8arrays').then(m => m.toString(contentACat)))
  t.assert(contentACatText)
})

/** @param {AsyncIterable<Uint8Array>} chunks */
async function concat (chunks) {
  let a = new Uint8Array()
  for await (const chunk of chunks) {
    a = new Uint8Array([...a, ...chunk])
  }
  return a
}

/**
 * @typedef ClaimableContent
 * @property {ArrayBuffer} buffer
 */

/**
 *
 * @param {Iterable<ClaimableContent>} contents
 * @returns
 */
function createMockContentClaims (contents) {
  const url = process.env.CONTENT_CLAIMS ?? 'https://staging.claims.web3.storage'
  return {
    url
  }
}

/**
 * @param {string} text
 */
async function createMockClaimableContent (text = (new Date()).toISOString()) {
  const buffer = (new TextEncoder()).encode(text).buffer
  /** @type {import('multiformats').UnknownLink} */
  let unixfsLink
  /** @type {ArrayBuffer} */
  let unixfsCar
  await UnixFS.createFileEncoderStream(new Blob([buffer]))
    .pipeThrough(new TransformStream({
      transform (block, controller) {
        unixfsLink = block.cid
        controller.enqueue(block)
      }
    }))
    .pipeThrough(new ShardingStream())
    .pipeTo(new WritableStream({
      write: async carBuffer => {
        unixfsCar = carBuffer
      }
    }))
  // @ts-expect-error this should be assigned in practice
  assert.ok(unixfsLink, 'unixfsLink must be a link')
  // @ts-expect-error this should be assigned in practice
  assert.ok(unixfsCar, 'unixfsCar must be a truthy')
  return { buffer, unixfsLink, unixfsCar }
}

/**
 * test scenario that setups up a hoverboard running in a worker,
 * a libp2p that can connect to it over websocket,
 * and some example data to test with
 * @param {object} options
 * @param {object} [options.contentClaims] - content claims service
 * @param {string} [options.contentClaims.url] - url of content claims service
 */
async function createHeliaBitswapScenario ({ contentClaims } = {}) {
  const [dynamo, s3] = await Promise.all([createDynamo(), createS3()])
  const [table, bucket] = await Promise.all([createDynamoTable(dynamo.client), createS3Bucket(s3.client)])
  const builder = new Builder(dynamo.client, table, s3.client, 'us-west-2', bucket)
  const encoder = new TextEncoder()
  const expected = 'hoverboard 🛹'
  const blob = new Blob([encoder.encode(expected)])
  const root = await builder.add(blob)

  console.warn('Creating local hoverboard')
  const worker = await createWorker({
    S3_ENDPOINT: s3.endpoint,
    DYNAMO_ENDPOINT: dynamo.endpoint,
    DYNAMO_REGION: dynamo.region,
    DYNAMO_TABLE: table,
    AWS_ACCESS_KEY_ID: s3.credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: s3.credentials.secretAccessKey,
    PEER_ID_JSON: JSON.stringify(peerId),
    ...(contentClaims?.url ? { CONTENT_CLAIMS: contentClaims.url } : {})
  })
  const hoverboard = getListenAddr(worker)

  console.warn('Creating local libp2p')
  const libp2p = await createLibp2p({
    connectionEncryption: [noise()],
    transports: [webSockets()],
    streamMuxers: [mplex()],
    services: {
      identify: identifyService()
    }
  })

  console.warn('Creating local helia')
  const helia = await createHelia({
    libp2p
  })
  const heliaFs = unixfs(helia)
  return {
    expected,
    helia,
    heliaFs,
    hoverboard,
    libp2p,
    root
  }
}
