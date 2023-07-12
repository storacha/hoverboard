/* eslint-env serviceworker */
import { createFromJSON } from '@libp2p/peer-id-factory'
import { createLibp2p } from 'libp2p'
import { identifyService } from 'libp2p/identify'
import { mplex } from '@libp2p/mplex'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { multiaddr } from '@multiformats/multiaddr'
import { version } from '../package.json'

/** @type {import('cf-libp2p-ws-transport').WebSocketListener} */
let libp2pWebSocket

/** @type {import('libp2p').Libp2p} */
let libp2p

/**
 * @typedef {object} Env
 * @prop {string} LISTEN_ADDR - libp2p multiaddr for ip/port to bind to
 * @prop {string} PEER_ID_JSON
 */

/**
 * Setup our libp2p service
 * @param {Env} env
 */
export async function initLibp2p (env) {
  const listenAddr = env.LISTEN_ADDR
  const peerId = await createFromJSON(JSON.parse(env.PEER_ID_JSON))
  console.log(`🛹 ${listenAddr}/p2p/${peerId.toString()}`)

  const { noise } = await import('@chainsafe/libp2p-noise')
  const ws = new WebSockets()

  libp2p = await createLibp2p({
    peerId,
    addresses: { listen: [listenAddr] },
    transports: [() => ws],
    streamMuxers: [mplex()],
    connectionEncryption: [noise()],
    services: {
      identify: identifyService()
    }
  })

  // @ts-expect-error
  libp2pWebSocket = ws.listenerForMultiaddr(multiaddr(listenAddr))
  if (!libp2pWebSocket) {
    throw new Error(`No listener for provided listen address ${listenAddr}`)
  }

  return libp2p
}

/**
 * handler for GET /
 * @param {Env} env
 */
export async function getHome (env) {
  const peerId = JSON.parse(env.PEER_ID_JSON).id
  const body = `⁂ hoverboard v${version} ${peerId}\n`
  return new Response(body, {
    headers: { 'content-type': 'text/plain' }
  })
}

export default {
  /**
   * Handle requests.
   * - libp2p websocket requests hit `/p2p/:peerid` with the upgrade header set.
   * - other requests are assumed to be http
   *
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch (request, env, ctx) {
    try {
      const upgrade = request.headers.get('Upgrade')
      if (upgrade === 'websocket') {
        if (!libp2pWebSocket) {
          await initLibp2p(env)
        }
        const res = await libp2pWebSocket.handleRequest(request)
        return res
      }

      const { pathname } = new URL(request.url)
      if (pathname === '' || pathname === '/') {
        return getHome(env)
      }
      return new Response('Not Found', { status: 404 })
    } catch (err) {
      console.error(err)
      // @ts-expect-error
      return new Response(err.message ?? err, { status: 500 })
    }
  }
}

/* HOVERBOARD 🛹 */
