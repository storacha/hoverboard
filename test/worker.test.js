import { unstable_dev as testWorker } from 'wrangler'
import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identifyService } from 'libp2p/identify'
import { createLibp2p } from 'libp2p'
import { mplex } from '@libp2p/mplex'
import { peerId } from './fixture/peer.js'
import test from 'ava'
import { hasOwnProperty } from '../src/utils/object.js'
import { createSimpleContentClaimsScenario, listen, mockClaimsService } from './lib/content-claims-nodejs.js'
import assert from 'node:assert'
import { CARReaderStream } from 'carstream'
import { sha256 } from 'multiformats/hashes/sha2'
import * as bytes from 'multiformats/bytes'

/* global WritableStream */

/** @type {any[]} */
const workers = []

test.after(_ => {
  workers.forEach(w => w.stop())
})

/**
 * @typedef {"none" | "info" | "error" | "log" | "warn" | "debug"} LogLevel
 */

/**
 * @param {unknown} input
 * @returns {LogLevel | undefined}
 */
const createLogLevel = (input) => {
  const levels = /** @type {const} */ (['none', 'info', 'error', 'log', 'warn', 'debug'])
  // @ts-expect-error because input is string not LogLevel
  if (levels.includes(input)) {
    return /** @type {LogLevel} */ (input)
  }
}

/**
 * @param {Record<string, string>} env
 * @param {object} options
 * @param {"none" | "info" | "error" | "log" | "warn" | "debug"} [options.logLevel]
 */
async function createWorker (env = {}, { logLevel = createLogLevel(process.env.WORKER_TEST_LOG_LEVEL) } = {}) {
  const w = await testWorker('src/worker.js', {
    ...(logLevel ? { logLevel } : {}),
    vars: {
      PEER_ID_JSON: JSON.stringify(peerId),
      ...env
    },
    experimental: {
      disableExperimentalWarning: true
    }
  })
  workers.push(w)
  return w
}

/**
 * @param {object} worker
 * @param {string} worker.address
 * @param {number} worker.port
 */
function getListenAddr ({ port, address }) {
  return multiaddr(`/ip4/${address}/tcp/${port}/ws/p2p/${peerId.id}`)
}

test('get /', async t => {
  const worker = await createWorker()
  const resp = await worker.fetch()
  const text = await resp.text()
  t.regex(text, new RegExp(peerId.id))
})

test('libp2p identify', async t => {
  const worker = await createWorker({})
  const libp2p = await createLibp2p({
    connectionEncryption: [noise()],
    transports: [webSockets()],
    streamMuxers: [mplex()],
    services: {
      identify: identifyService()
    }
  })
  const peerAddr = getListenAddr(worker)
  console.warn(peerAddr)
  const peer = await libp2p.dial(peerAddr)
  t.is(peer.remoteAddr.getPeerId()?.toString(), peerId.id)
  await t.notThrowsAsync(() => libp2p.services.identify.identify(peer))
})

// @todo - dont actually read from claims.web3.storage - use a mock claims URL
test('get /dns/claims.web3.storage/content-claims/{cid}', async t => {
  const worker = await createWorker()
  const cid = 'bafybeidtvuezudgvdciehupi2nlduu5t2r6nkb7o3brwqhdrig6jfc2gd4'
  const resp = await worker.fetch(`/dns/claims.web3.storage/content-claims/${cid}`)
  t.is(resp.status, 200)
  const claimsCollection = await resp.json()
  t.is(typeof claimsCollection, 'object')
  if (!(typeof claimsCollection === 'object' && claimsCollection)) {
    throw t.fail('claimsCollection should be an object')
  }
  t.is(hasOwnProperty(claimsCollection, 'totalItems') && claimsCollection.totalItems, 2)
  console.warn('claimsCollection', JSON.stringify(claimsCollection, undefined, 2))
})

test('get content claims from mocked content-claims', async t => {
  const testInput = `test-${Math.random().toString().slice(2)}`
  const { claims, inputCID } = await (createSimpleContentClaimsScenario(testInput))
  const claimsMock = mockClaimsService(await claims)
  const claimsServer = await listen(claimsMock)
  /** @param {URL} url */
  const useClaimsServer = async (url) => {
    const worker = await createWorker()

    // query for cid and expect no claims
    const query = { about: inputCID.toString(), source: claimsServer.url.toString() }
    const response = await worker.fetch(new URL(`/claims/?${new URLSearchParams(query).toString()}`, claimsServer.url))
    t.is(response.status, 200)
    const claimsCollection = /** @type {any} */ (await response.json())
    t.is(claimsCollection.totalItems, 1)
    console.warn('claimsCollection', JSON.stringify(claimsCollection))

    const locationClaim = claimsCollection.items.find((/** @type {{ type: string; }} */ item) => item.type === 'assert/location')
    const locations = Array.isArray(locationClaim.location) ? locationClaim.location : [locationClaim.location]
    // one location (based on createSimpleContentClaimsScenario setup)
    t.is(locations.length, 1)
    const location = locations[0]
    assert.ok(typeof location === 'string')

    // fetch the location, expect it to be a car file
    const locationResponse = await fetch(location)
    t.is(locationResponse.headers.get('content-type'), 'application/vnd.ipld.car')

    /** @type {Array<import('carstream/api').Block>} */
    const blocksFromLocation = []
    await locationResponse.body?.pipeThrough(new CARReaderStream()).pipeTo(new WritableStream({
      async write (block) {
        blocksFromLocation.push(block)
        const digest = await sha256.digest(block.bytes)
        if (!bytes.equals(block.cid.multihash.bytes, digest.bytes)) {
          throw new Error(`hash verification failed: ${block.cid}`)
        }
      }
    }))
    t.is(blocksFromLocation.length, 1, 'car fetched from location has one block')
    t.is(blocksFromLocation[0].cid.toString(), inputCID.toString(), 'car at location block has inputCID')
  }
  try {
    await useClaimsServer(claimsServer.url)
  } finally {
    await claimsServer.stop()
  }
})
