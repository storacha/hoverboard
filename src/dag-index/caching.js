import { base58btc } from 'multiformats/bases/base58'
import * as IndexEntry from './entry.js'

/**
 * @typedef {import('./api.js').IndexEntry} IndexEntry
 * @typedef {import('./api.js').Index} Index
 */

export class CachingIndex {
  /**
   * @param {Index} index
   * @param {Cache} cache
   * @param {ExecutionContext} ctx
   * @param {import('../metrics.js').Metrics} metrics
   */
  constructor (index, cache, ctx, metrics) {
    this.index = index
    this.cache = cache
    this.ctx = ctx
    this.metrics = metrics
  }

  /** @param {import('multiformats').UnknownLink} cid */
  async get (cid) {
    const key = this.toCacheKey(cid)
    const cached = await this.cache.match(key)
    if (cached) {
      this.metrics.indexes++
      this.metrics.indexesCached++
      return cached.json()
    }
    const res = await this.index.get(cid)
    if (res) {
      this.metrics.indexes++
      this.ctx.waitUntil(this.cache.put(key, new Response(IndexEntry.encode(res))))
    }
    return res
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   */
  toCacheKey (cid) {
    const key = base58btc.encode(cid.multihash.bytes)
    const cacheUrl = new URL(key, 'https://index.web3.storage')
    return new Request(cacheUrl.toString(), {
      method: 'GET',
      headers: new Headers({ 'content-type': 'application/octet-stream' })
    })
  }
}
