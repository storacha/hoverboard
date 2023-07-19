/* eslint-env serviceworker */
import toMultiaddr from '@multiformats/uri-to-multiaddr'
import { WebSockets } from 'cf-libp2p-ws-transport'
import { getLibp2p, getPeerId, getWebSocketListener } from './libp2p.js'
import { getBlockstore } from './blocks.js'
import { version } from '../package.json'

/**
 * @typedef {object} Env
 * @prop {string} LISTEN_ADDR - libp2p multiaddr for ip/port to bind to
 * @prop {string} DYNAMO_TABLE - block index table name
 * @prop {string} DYNAMO_REGION - block index table region
 * @prop {string} [DYNAMO_ENDPOINT] - override the dynamo api url
 * @prop {string} [S3_ENDPOINT] - override the s3 api url
 * @prop {string} [S3_REGIONS] - override the list of s3 regions to fetch blocks from
 * @prop {R2Bucket} CARPARK - R2 binding for CAR bucket
 * @prop {KVNamespace} DENYLIST - KV binding for denylist
 * @prop {string} AWS_ACCESS_KEY_ID - secret key id
 * @prop {string} AWS_SECRET_ACCESS_KEY - secret key
 * @prop {string} PEER_ID_JSON - secret stringified json peerId spec for this node
 */

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
    /** @type {import('@cloudflare/workers-types').WebSocket | undefined} */
    let websocket
    try {
      const upgrade = request.headers.get('Upgrade')
      if (upgrade === 'websocket') {
        const transport = new WebSockets()
        const peerId = await getPeerId(env)
        const bs = await getBlockstore(env, ctx)
        await getLibp2p(env, bs, peerId, transport)
        const listener = getWebSocketListener(env, transport)
        const res = await listener.handleRequest(request)
        // @ts-expect-error res will have a raw websocket server on it if worked.
        websocket = res.websocket
        return res
      }

      // not a libp2p req. handle as http
      const { pathname } = new URL(request.url)
      if (pathname === '' || pathname === '/') {
        const res = await getHome(request, env)
        return res
      }
      return new Response('Not Found', { status: 404 })
    } catch (err) {
      if (websocket) {
        // @ts-expect-error
        websocket.close(418, err.message)
      }
      console.error('fetch handler error', err)
      // @ts-expect-error
      return new Response(err.message ?? err, { status: 500 })
    }
  }
}

/**
 * handler for GET /
 * @param {Request} request
 * @param {Env} env
 */
export async function getHome (request, env) {
  const peerId = await getPeerId(env)
  const addr = toMultiaddr(request.url.replace('http', 'ws')).encapsulate(`/p2p/${peerId}`)
  const body = `⁂ hoverboard v${version} ${addr}\n`
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  })
}

/* HOVERBOARD 🛹 */
