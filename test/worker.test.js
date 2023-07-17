import { unstable_dev as testWorker } from 'wrangler'
import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identifyService } from 'libp2p/identify'
import { createLibp2p } from 'libp2p'
import { mplex } from '@libp2p/mplex'
import { peerId } from './fixture/peer.js'
import test from 'ava'

const workers = []

test.after(_ => {
  workers.forEach(w => w.stop())
})

/**
 * @param {Record<string, string>} env
 */
async function createWorker (env = {}) {
  const w = await testWorker('src/worker.js', {
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
 * @param {string} worker.ip
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
  console.log(peerAddr)
  const peer = await libp2p.dial(peerAddr)
  t.is(peer.remoteAddr.getPeerId().toString(), peerId.id)
  await t.notThrowsAsync(() => libp2p.services.identify.identify(peer))
})
