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
import { Blob } from 'node:buffer'
import { createDynamo, createDynamoTable, createS3, createS3Bucket } from './lib/aws.js'

import test from 'ava'

const PEER_ID_JSON = '{"id":"Qmcv3CsJAN8ptXR8vm5a5GRrzkHGjaEUF9cQRGzYptMwzp","privKey":"CAASpgkwggSiAgEAAoIBAQDrJS8e0E/eXiYqlE65jS/H4NNuvXwKGPTQlThKcJ1h92g/HjgbEjL52Zux82amHVfaKI9Vw+5BiC+trwpne/4mHl4d0YD6Ndeo8VjRbEnrlhBx2pWTyvof1dZeR522TGq8vc63ek9kJRY6Hdu4yBuvr7VK7XSzbLoew9Hfun+BZMN13+miQ04EHAjOfvVoDUyR78Sk3ljM8Nqaq3dBPmkuBY5ADjbkpf94N7SuopjvEKnMtryDUhA/jxJU7+6/m5IN5mag2OgZZFov5XxKwdc1KWkLH+zjo7pWyJ4+VRpVwv1vcPy/Qs1/Xf61B4lvNFOOBPE3nI+kwu1jBauPuNc7AgMBAAECggEACQUIjBsJLmWzjV5H1RA87Rmvooep4Dr+Q1BBau9HM1Ly3kxdKSb02C/DrB+eKDnnoX8PXQawQDZmY4FJNU9Eso3nXN5NsYIq7Nh61h7J9oS4pZ6DQN8JUEQokHT0OU/Cgzsq6uHumfSnXuVSBQIQAT0MmeorRal93imqKxpcsNpHFSZdi1yNAWE9yxpXlF1LAkkZDmlDqdLg2zsAJQDZf/JnBak45i/E7AnDD/rR5t+VKeWupC9QA52X7MyAp9xeJCJmRgrHs9Bj/uQF5ozQqCBaIgekbh+OCxpzTqjpVNGwWuOxIUsQpAGqCpGzGIECbw5XN/qOEsuxpt45e3mtYQKBgQDy+t8vEi3AXCfpYRuI2+GNQI/6Uch4LJ6ohP0CHNLTtKpXEbBPfBAGryHWrR3SNTxjF7myFM5YR+V5eRBslkRJt9JSN11kAe1rA98SvmlHB3dnISgLKbrmg+fXvg3rEf6n57x8+Dsh9zwxQyHjTg2MArDdicnIyvdslYazeH+zSwKBgQD3vtZ/hql37bNLSIoJl+FiSHl57KoZSA/RIE0uVkqJtgCG4f6O1AMvyCDa7vtly460RtyaKg6ADW/jepsOydiOKKm1E/5MgG7ZttbrhPDfoXeHCEPzHs0J2I9D4OXQ8uSVbIZWKEcP5702lpHX5E0iWIVaErFTZEkuSazYwYUF0QKBgGcqYWyo+Uf9WOzcUEaRpXjF+tu7sbRkrZC7tnkZJ+K/iLujRQrakCtmXKW7pzfDZrpkLnIQJ3SQQjyLTI/uVVw/ckt6Omrl7ppLcIGS2zxPTUE6cLgcpcCOLPgLN/mhEFDWMc+VzfWj9ais6kyKrXHPCq1lfYmFs/wkmKbG+OF1AoGAWh0CLHSw47yEQNfrzb1+757pAJ5C6Ns7VZfoOviMODcJTgaZ7x3S4uhqevf+XXKDP7OevjyZ9Z3tmtKX3/MvX9YOlJznHLCCoZJN7nD2pIE41tb80EvdzL0Gr2v4a95NosRMwL35yyFBw79U4TBbliiYqMCv22NY8ws9YcJSPmECgYALiFLv7Z90NOYsi0pZh3koxKtYEOEmaNIqOlBbXP2J0eo6wJKFR0nbu8t+s5poJUiU9t+e1V+Lyjy6aFg/fWvc9b9ZB9fm+MIltHVaFGsC7cMhPn3Q8demehkQvTl2XBxnhOobPdFxxJsjpDpShOgRfKBzwLEH5arLmDUrw6FNuQ==","pubKey":"CAASpgIwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDrJS8e0E/eXiYqlE65jS/H4NNuvXwKGPTQlThKcJ1h92g/HjgbEjL52Zux82amHVfaKI9Vw+5BiC+trwpne/4mHl4d0YD6Ndeo8VjRbEnrlhBx2pWTyvof1dZeR522TGq8vc63ek9kJRY6Hdu4yBuvr7VK7XSzbLoew9Hfun+BZMN13+miQ04EHAjOfvVoDUyR78Sk3ljM8Nqaq3dBPmkuBY5ADjbkpf94N7SuopjvEKnMtryDUhA/jxJU7+6/m5IN5mag2OgZZFov5XxKwdc1KWkLH+zjo7pWyJ4+VRpVwv1vcPy/Qs1/Xf61B4lvNFOOBPE3nI+kwu1jBauPuNc7AgMBAAE="}'
const PEER_ID = JSON.parse(PEER_ID_JSON).id

const workers = []

test.after(_ => {
  workers.forEach(w => w.stop())
})

/**
 * @param {import('../src/worker.js').Env} env
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
 * @param {string} worker.ip
 * @param {number} worker.address
 */
function getListenAddr ({ port, address }) {
  return multiaddr(`/ip4/${address}/tcp/${port}/ws/p2p/${PEER_ID}`)
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
  const [dynamo, s3] = await Promise.all([createDynamo(), createS3()])
  const [table, bucket] = await Promise.all([createDynamoTable(dynamo.client), createS3Bucket(s3.client)])
  const builder = new Builder(dynamo.client, table, s3.client, 'us-west-2', bucket)
  const encoder = new TextEncoder()
  const blob = new Blob([encoder.encode('hoverboard 🛹')])
  const root = await builder.add(blob)

  console.log('Creating local hoverboard')
  const worker = await createWorker({
    S3_ENDPOINT: s3.endpoint,
    DYNAMO_ENDPOINT: dynamo.endpoint,
    DYNAMO_REGION: dynamo.region,
    DYNAMO_TABLE: table,
    AWS_ACCESS_KEY_ID: s3.credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: s3.credentials.secretAccessKey,
    PEER_ID_JSON
  })
  const hoverboard = getListenAddr(worker)

  console.log('Creating local libp2p')
  const libp2p = await createLibp2p({
    connectionEncryption: [noise()],
    transports: [webSockets()],
    streamMuxers: [mplex()],
    services: {
      identify: identifyService()
    }
  })

  console.log('Creating local helia')
  const helia = await createHelia({
    libp2p
  })
  const heliaFs = unixfs(helia)

  console.log(`Dialing ${hoverboard}`)
  const peer = await libp2p.dial(hoverboard)
  t.is(peer.remoteAddr.getPeerId().toString(), PEER_ID)

  const decoder = new TextDecoder('utf8')
  let text = ''

  console.log(`Fetching ${root}`)
  for await (const chunk of heliaFs.cat(root)) {
    text += decoder.decode(chunk, { stream: true })
  }

  text += decoder.decode()

  t.true(await helia.blockstore.has(root), 'block should now be in helia blockstore')

  t.is(text, 'hoverboard 🛹', 'bitswap roundtrippin')
})
