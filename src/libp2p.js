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
  console.time('libp2p init')
  const listenAddr = env.LISTEN_ADDR
  const peerId = await createFromJSON(JSON.parse(env.PEER_ID_JSON))
  console.log(`🛹 ${listenAddr}/p2p/${peerId.toString()}`)

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

  const miniswap = new Miniswap(blockstore)
  libp2p.handle(BITSWAP_PROTOCOL, miniswap.handler)

  // @ts-expect-error
  const libp2pWebSocket = ws.listenerForMultiaddr(multiaddr(listenAddr))
  if (!libp2pWebSocket) {
    throw new Error(`No listener for provided listen address ${listenAddr}`)
  }
  console.timeEnd('libp2p init')
  return libp2pWebSocket
}
