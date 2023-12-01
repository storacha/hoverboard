import { unstable_dev as testWorker } from 'wrangler'
import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identifyService } from 'libp2p/identify'
import { createLibp2p } from 'libp2p'
import { mplex } from '@libp2p/mplex'
import { peerId } from './fixture/peer.js'
import test from 'ava'
import * as http from 'node:http'
import { hasOwnProperty } from '../src/utils/object.js'
import { mockClaimsService } from './lib/content-claims-nodejs.js'

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
})

test('get content claims from mocked content-claims', async t => {
  const cid = 'bafybeidtvuezudgvdciehupi2nlduu5t2r6nkb7o3brwqhdrig6jfc2gd4'
  const claimsMock = await mockClaimsService()
  const claimsServer = await listen(claimsMock)
  /** @param {URL} url */
  const useClaimsServer = async (url) => {
    const worker = await createWorker()
    const query = { about: cid, source: claimsServer.url.toString() }
    const claimsUrl = new URL(`/claims/?${new URLSearchParams(query).toString()}`, claimsServer.url)
    const response = await worker.fetch(claimsUrl)
    t.is(response.status, 200)
    const claimsCollection = /** @type {any} */ (await response.json())
    t.is(claimsCollection.totalItems, 0)

    // @todo now get real claims
  }
  try {
    await useClaimsServer(claimsServer.url)
  } finally {
    await claimsServer.stop()
  }
})

/**
 * start listening to a node http request listener.
 * return a URL to the listening server, and a function that will stop listening
 * @param {object} options
 * @param {import('http').RequestListener} options.listener
 * @param {number} port
 */
async function listen ({ listener }, port = 0) {
  const server = http.createServer(listener)
  await new Promise((resolve) => server.listen(port, () => resolve(undefined)))
  const url = getServerUrl(server)
  const stop = () => {
    server.closeAllConnections()
    return new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve(error))
    })
  }
  return { url, stop }
}

/**
 * @param {import('node:http').Server} server
 * @returns URL
 */
function getServerUrl (server) {
  const address = server.address()
  if (typeof address !== 'object') { throw new Error(`unexpected non-object address ${address}`) }
  return new URL(`http://localhost:${address?.port}`)
}
