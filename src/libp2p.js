/* eslint-env serviceworker */
import { createFromJSON } from '@libp2p/peer-id-factory'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { multiaddr } from '@multiformats/multiaddr'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { identifyService } from 'libp2p/identify'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { createLibp2p } from 'libp2p'

/** @typedef {import('./worker.js').Env} Env */

/**
 * Setup our libp2p service
 * @param {Env} env
 * @param {import('./deny.js').Blockstore} blockstore
 */
export async function getLibp2p (env, blockstore) {
  const listenAddr = env.LISTEN_ADDR ?? '/dns4/localhost/tcp/443/wss'
  const peerId = await createFromJSON(JSON.parse(env.PEER_ID_JSON))
  // rough metrics as a staring point
  let blocks = 0
  let bytes = 0
  let miss = 0
  const miniswap = new Miniswap({
    async has (cid) {
      return blockstore.has(cid)
    },
    async get (cid) {
      const res = await blockstore.get(cid)
      if (res) {
        bytes += res?.byteLength ?? 0
        blocks++
      } else {
        miss++
      }
      return res
    }
  })
  const ws = new WebSockets()
  const libp2p = await createLibp2p({
    peerId,
    addresses: { listen: [listenAddr] },
    transports: [() => ws],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    services: {
      identify: identifyService()
    }
  })
  libp2p.addEventListener('peer:connect', (evt) => {
    const remotePeer = evt.detail
    console.log(JSON.stringify({ msg: 'peer:connect', peer: remotePeer.toString() }))
  })
  libp2p.addEventListener('peer:disconnect', (evt) => {
    const remotePeer = evt.detail
    console.log(JSON.stringify({ msg: 'peer:disconnect', peer: remotePeer.toString(), blocks, bytes, miss }))
  })
  libp2p.handle(BITSWAP_PROTOCOL, miniswap.handler)

  // @ts-expect-error
  const libp2pWebSocket = ws.listenerForMultiaddr(multiaddr(listenAddr))
  if (!libp2pWebSocket) {
    throw new Error(`No listener for provided listen address ${listenAddr}`)
  }
  return libp2pWebSocket
}
