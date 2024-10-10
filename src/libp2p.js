import { uriToMultiaddr } from '@multiformats/uri-to-multiaddr'
import { privateKeyFromProtobuf } from '@libp2p/crypto/keys'
import { fromString } from 'uint8arrays'
import { Miniswap, BITSWAP_PROTOCOL } from 'miniswap'
import { identify } from '@libp2p/identify'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { mplex } from '@libp2p/mplex'
import { createLibp2p } from 'libp2p'

/**
 * @typedef {import('./worker.js').Env} Env
 * @typedef {import('cf-libp2p-ws-transport').WebSocketsComponents} WebSocketsComponents
 * @typedef {import('cf-libp2p-ws-transport').WebSockets} WebSockets
 */

/**
 * Setup our libp2p service
 * @param {Env} env
 */
export function getPrivateKey (env) {
  const bytes = fromString(JSON.parse(env.PEER_ID_JSON).privKey, 'base64pad')
  return privateKeyFromProtobuf(bytes)
}

/**
 * Setup our libp2p service
 * @param {Env} env
 * @param {() => (components: WebSocketsComponents) => WebSockets} transport
 * @param {import('@multiformats/multiaddr').Multiaddr} listenAddr
 */
export async function getLibp2p (env, transport, listenAddr) {
  const privateKey = getPrivateKey(env)
  const libp2p = await createLibp2p({
    privateKey,
    addresses: { listen: [listenAddr.toString()] },
    transports: [transport()],
    streamMuxers: [yamux(), mplex()],
    connectionEncrypters: [noise()],
    services: {
      identify: identify()
    }
  })
  return libp2p
}

/**
 * @param {import('libp2p').Libp2p} libp2p
 * @param {import('./blocks.js').Blockstore} blockstore
 * @param {(err: Error) => Promise<void>} onError
 */
export function enableBitswap (libp2p, blockstore, onError = async () => {}) {
  const miniswap = new Miniswap({
    async has (cid) {
      try {
        const res = await blockstore.has(cid)
        return res
      } catch (err) {
        await onError(asError(err))
        return false
      }
    },
    async get (cid) {
      try {
        const res = await blockstore.get(cid)
        return res
      } catch (err) {
        await onError(asError(err))
      }
    }
  })
  libp2p.handle(BITSWAP_PROTOCOL, miniswap.handler)
}

/** @param {unknown} err */
function asError (err) {
  if (err instanceof Error) {
    return err
  }
  return new Error(`${err}`)
}

/**
 * Setup our libp2p websocket listener
 * @param {import('cf-libp2p-ws-transport').WebSockets} transport
 * @param {import('@multiformats/multiaddr').Multiaddr} listenAddr
 */
export function getWebSocketListener (transport, listenAddr) {
  const listener = transport.listenerForMultiaddr(listenAddr)
  if (!listener) {
    throw new Error(`No listener for provided listen address ${listenAddr}`)
  }
  return listener
}

/**
 * Find our local listener multiaddr
 * @param {Request} request
 */
export function getListenAddr (request) {
  return uriToMultiaddr(request.url.replace('http', 'ws'))
}
