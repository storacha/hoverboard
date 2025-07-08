import { Miniflare } from 'miniflare'
import { Builder } from './builder.js'
import { mockBucketService } from './bucket.js'
import * as MockIndexingService from './indexing-service.js'
import { getListenAddr, createLibp2p, peerId } from './libp2p.js'

/**
 * @typedef {{
*   indexingService: import('../helpers/indexing-service.js').MockIndexingService
*   bucketService: import('../helpers/bucket.js').MockBucketService
*   builder: import('../helpers/builder.js').Builder
*   worker: import('miniflare').Miniflare
*   libp2p: import('libp2p').Libp2p<{ identify: ReturnType<ReturnType<import('@libp2p/identify').identify>> }>
*   multiaddr: import('@multiformats/multiaddr').Multiaddr
* }} TestContext
*/

/** @returns {Promise<TestContext>} */
export const create = async () => {
  const indexingService = await MockIndexingService.create()

  const workerConf = {
    scriptPath: 'dist/worker.mjs',
    modules: true,
    compatibilityDate: '2024-05-23',
    host: '127.0.0.1',
    port: 8787,
    bindings: {
      INDEXING_SERVICE_URL: indexingService.url.toString(),
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
  const builder = new Builder(bucket, bucketService.url)

  console.log('Creating local libp2p')
  const libp2p = await createLibp2p()
  const multiaddr = getListenAddr(workerConf)
  return { indexingService, bucketService, builder, worker, libp2p, multiaddr }
}

/** @param {TestContext} context */
export const destroy = context => Promise.all([
  context.indexingService.server.close(),
  context.bucketService.close(),
  context.worker.dispose(),
  context.libp2p.stop()
])
