/* eslint-env serviceworker */
import { createFromJSON } from '@libp2p/peer-id-factory'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { multiaddr } from '@multiformats/multiaddr'
import { identifyService } from 'libp2p/identify'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { createLibp2p } from 'libp2p'

/** @typedef {import('./worker.js').Env} Env */

/**
 * Setup our libp2p service
 * @param {Env} env
 */
export async function getPeerId (env) {
  return createFromJSON(JSON.parse(env.PEER_ID_JSON))
}

/**
 * Setup our libp2p service
 * @param {Env} env
 * @param {import('./deny.js').Blockstore} blockstore
 * @param {import('@libp2p/interface-peer-id').PeerId} peerId
 * @param {import('cf-libp2p-ws-transport').WebSockets} transport
 */
export async function getLibp2p (env, blockstore, peerId, transport) {
  const libp2p = await createLibp2p({
    peerId,
    addresses: { listen: [getListenAddr(env)] },
    transports: [() => transport],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    services: {
      identify: identifyService()
    }
  })

  // rough metrics as a staring point
  let blocks = 0
  let bytes = 0
  let miss = 0

  const miniswap = new Miniswap({
    async has (cid) {
      try {
        const res = await blockstore.has(cid)
        return res
      } catch (err) {
        libp2p.stop()
        throw err
      }
    },
    async get (cid) {
      try {
        const res = await blockstore.get(cid)
        if (res) {
          bytes += res.byteLength
          blocks++
        } else {
          miss++
        }
        return res
      } catch (err) {
        libp2p.stop()
        throw err
      }
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

  return libp2p
}

/**
 * Setup our libp2p websocket listener
 * @param {Env} env
 * @param {import('cf-libp2p-ws-transport').WebSockets} transport
 */
export function getWebSocketListener (env, transport) {
  const listenAddr = multiaddr(getListenAddr(env))
  // @ts-expect-error
  const listener = transport.listenerForMultiaddr(listenAddr)
  if (!listener) {
    throw new Error(`No listener for provided listen address ${listenAddr}`)
  }
  return listener
}

/**
 * Setup our libp2p websocket listener
 * @param {Env} env
 */
export function getListenAddr (env) {
  return env.LISTEN_ADDR ?? '/dns4/localhost/tcp/443/wss'
}
