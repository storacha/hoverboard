import { Miniflare } from 'miniflare'
import { Builder } from './builder.js'
import { mockBucketService } from './bucket.js'
import { mockClaimsService } from './content-claims.js'
import { getListenAddr, createLibp2p, peerId } from './libp2p.js'

/**
 * @typedef {{
*   claimsService: import('../helpers/content-claims.js').MockClaimsService
*   bucketService: import('../helpers/bucket.js').MockBucketService
*   builder: import('../helpers/builder.js').Builder
*   worker: import('miniflare').Miniflare
*   libp2p: import('libp2p').Libp2p<{ identify: ReturnType<ReturnType<import('libp2p/identify').identifyService>> }>
*   multiaddr: import('@multiformats/multiaddr').Multiaddr
* }} TestContext
*/

/** @returns {Promise<TestContext>} */
export const create = async () => {
  const claimsService = await mockClaimsService()

  const workerConf = {
    scriptPath: 'dist/worker.mjs',
    modules: true,
    compatibilityDate: '2024-05-23',
    host: '127.0.0.1',
    port: 8787,
    bindings: {
      CONTENT_CLAIMS_URL: claimsService.url.toString(),
      PEER_ID_JSON: JSON.stringify(peerId),
      DENYLIST: ''
    },
    r2Buckets: ['CARPARK']
  }

  console.log('Creating local hoverboard')
  const worker = new Miniflare(workerConf)

  const bucket = await worker.getR2Bucket(workerConf.r2Buckets[0])
  const bucketService = await mockBucketService(
    /** @type {import('@web3-storage/public-bucket').Bucket} */
    (bucket)
  )
  const builder = new Builder(bucket)

  console.log('Creating local libp2p')
  const libp2p = await createLibp2p()
  const multiaddr = getListenAddr(workerConf)
  return { claimsService, bucketService, builder, worker, libp2p, multiaddr }
}

/** @param {TestContext} context */
export const destroy = context => Promise.all([
  context.claimsService.close(),
  context.bucketService.close(),
  context.worker.dispose(),
  context.libp2p.stop()
])
