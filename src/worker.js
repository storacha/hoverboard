/* eslint-env serviceworker */
import { WebSockets } from 'cf-libp2p-ws-transport'
import defer from 'p-defer'
import { peerIdFromPrivateKey } from '@libp2p/peer-id'
import { enableBitswap, getLibp2p, getListenAddr, getPrivateKey, getWebSocketListener } from './libp2p.js'
import { getBlockstore } from './blocks.js'
import { version } from '../package.json'
import { Metrics } from './metrics.js'

/**
 * @typedef {object} Env
 * @prop {KVNamespace} DENYLIST - KV binding for denylist
 * @prop {string} PEER_ID_JSON - secret stringified json peerId spec for this node
 * @prop {string} CONTENT_CLAIMS_URL
 */

/** @type {ExportedHandler<Env>} */
export default {
  /**
   * Handle requests.
   * - libp2p websocket requests hit `/p2p/:peerid` with the upgrade header set.
   * - other requests are assumed to be http
   */
  async fetch (request, env, ctx) {
    const upgrade = request.headers.get('Upgrade')
    if (upgrade === 'websocket') {
      const metrics = new Metrics()
      /** @type {import('p-defer').DeferredPromise<WebSockets>} */
      const transportPromise = defer()
      /** @param {import('cf-libp2p-ws-transport').WebSocketsComponents} components */
      const transportFactory = components => {
        const ws = new WebSockets(components)
        transportPromise.resolve(ws)
        return ws
      }
      const bs = await getBlockstore(env, ctx, metrics)
      const listenAddr = getListenAddr(request)
      const libp2p = await getLibp2p(env, () => transportFactory, listenAddr)
      libp2p.addEventListener('peer:connect', (evt) => {
        const remotePeer = evt.detail
        console.log({ msg: 'peer:connect', peer: remotePeer.toString() })
      })
      libp2p.addEventListener('peer:disconnect', (evt) => {
        const remotePeer = evt.detail
        console.log({ msg: 'peer:disconnect', peer: remotePeer.toString(), ...metrics })
      })
      const onError = async (/** @type {Error} */ err) => {
        await libp2p.stop()
        if (!err.message.startsWith('Too many subrequests')) {
          throw err
        }
      }
      enableBitswap(libp2p, bs, onError)
      const transport = await transportPromise.promise
      const listener = getWebSocketListener(transport, listenAddr)
      return listener.handleRequest(request)
    }

    // not a libp2p req. handle as http
    const { pathname } = new URL(request.url)
    if (pathname === '' || pathname === '/') {
      const res = getHome(request, env)
      return res
    }
    return new Response('Not Found', { status: 404 })
  }
}

/**
 * handler for GET /
 * @param {Request} request
 * @param {Env} env
 */
export function getHome (request, env) {
  const peerId = peerIdFromPrivateKey(getPrivateKey(env))
  const addr = getListenAddr(request).encapsulate(`/p2p/${peerId}`)
  const body = `⁂ hoverboard v${version} ${addr}\n`
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  })
}

/* HOVERBOARD 🛹 */
