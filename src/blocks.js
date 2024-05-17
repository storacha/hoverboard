/* eslint-env serviceworker */
import { CachingIndex } from './dag-index/caching.js'
import { ContentClaimsIndex } from './dag-index/content-claims.js'
import { DenyingBlockStore } from './deny.js'

/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 * @typedef {import('./worker.js').Env} Env
 *
 * @typedef {object} Blockstore
 * @prop {(cid: UnknownLink) => Promise<boolean>} has
 * @prop {(cid: UnknownLink) => Promise<Uint8Array | undefined>} get
 */

/**
 * @param {Env} env
 * @param {ExecutionContext} ctx
 * @param {import('./metrics.js').Metrics} metrics
 */
export async function getBlockstore (env, ctx, metrics) {
  const claimsIndex = new ContentClaimsIndex()
  const index = new CachingIndex(claimsIndex, await caches.open('index'), ctx, metrics)
  const blocks = new DagHausBlockStore(index, metrics)
  const cached = new CachingBlockStore(blocks, await caches.open('blockstore:bytes'), ctx, metrics)
  return env.DENYLIST ? new DenyingBlockStore(env.DENYLIST, cached) : cached
}

/**
 * Cache block bytes for a CID
 */
export class CachingBlockStore {
  /**
   * @param {Blockstore} blockstore
   * @param {Cache} cache
   * @param {ExecutionContext} ctx
   * @param {import('./metrics.js').Metrics} metrics
   */
  constructor (blockstore, cache, ctx, metrics) {
    this.blockstore = blockstore
    this.cache = cache
    this.ctx = ctx
    this.metrics = metrics
  }

  /**
   * @param {UnknownLink} cid
   */
  async has (cid) {
    const key = this.toCacheKey(cid)
    const cached = await this.cache.match(key)
    if (cached) return true
    return this.blockstore.has(cid)
  }

  /**
   * @param {UnknownLink} cid
   */
  async get (cid) {
    const key = this.toCacheKey(cid)
    const cached = await this.cache.match(key)
    if (cached) {
      const buff = await cached.arrayBuffer()
      const bytes = new Uint8Array(buff)
      this.metrics.blocks++
      this.metrics.blocksCached++
      this.metrics.blockBytes += bytes.byteLength
      this.metrics.blockBytesCached += bytes.byteLength
    }
    const res = await this.blockstore.get(cid)
    if (res) {
      this.ctx.waitUntil(this.cache.put(key, new Response(res)))
      return res
    }
  }

  /**
   * @param {UnknownLink} cid
   */
  toCacheKey (cid) {
    const cacheUrl = new URL(`/ipfs/${cid}?format=raw`, 'https://ipfs.io')
    return new Request(cacheUrl.toString(), {
      method: 'GET'
    })
  }
}

/**
 * A blockstore that copes with the dag.haus bucket legacy.
 * Also adapts car block style blockstore api that returns {cid, bytes}
 * to one that returns just the bytes to blend with miniswap api.
 */
export class DagHausBlockStore {
  /**
   * @param {import('./dag-index/api.js').Index} index
   * @param {import('./metrics.js').Metrics} metrics
   */
  constructor (index, metrics) {
    this.index = index
    this.metrics = metrics
  }

  /** @param {UnknownLink} cid */
  async has (cid) {
    return Boolean(await this.index.get(cid))
  }

  /** @param {UnknownLink} cid */
  async get (cid) {
    const idxEntry = await this.index.get(cid)
    if (!idxEntry) return

    for (const url of idxEntry.site.location) {
      const headers = { Range: `bytes=${idxEntry.site.range.offset}-${idxEntry.site.range.offset + idxEntry.site.range.length - 1}` }
      const res = await fetch(url, { headers })
      if (!res.ok) {
        console.warn(`failed to fetch ${url}: ${res.status} ${await res.text()}`)
        continue
      }
      return new Uint8Array(await res.arrayBuffer())
    }
  }
}
