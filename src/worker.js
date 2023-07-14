/* eslint-env serviceworker */
import { getLibp2p } from './libp2p.js'
import { version } from '../package.json'

/**
 * @typedef {object} Env
 * @prop {string} LISTEN_ADDR - libp2p multiaddr for ip/port to bind to
 * @prop {string} DYNAMO_TABLE - block index table name
 * @prop {string} DYNAMO_REGION - block index table region
 * @prop {R2Bucket} CARPARK - R2 binding
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
    try {
      const upgrade = request.headers.get('Upgrade')
      if (upgrade === 'websocket') {
        const libp2p = await getLibp2p(env)
        const res = await libp2p.handleRequest(request)
        return res
      }

      // not a libp2p req. handle as http
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

/**
 * handler for GET /
 * @param {Env} env
 */
export async function getHome (env) {
  const peerId = JSON.parse(env.PEER_ID_JSON).id
  const body = `⁂ hoverboard v${version} ${peerId}\n`
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  })
}

/* HOVERBOARD 🛹 */
