/* eslint-env serviceworker */
import { base58btc } from 'multiformats/bases/base58'
import { DenyingBlockStore } from './deny.js'
import * as BatchingFetcher from '@web3-storage/blob-fetcher/fetcher/batching'
import * as ContentClaimsLocator from '@web3-storage/blob-fetcher/locator/content-claims'
import * as Location from './location.js'

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
  const locator = ContentClaimsLocator.create({ serviceURL: env.CONTENT_CLAIMS_URL ? new URL(env.CONTENT_CLAIMS_URL) : undefined })
  const cachingLocator = new CachingLocator(locator, await caches.open('index'), ctx, metrics)
  const blocks = new BlockStore(cachingLocator, metrics)
  const cached = new CachingBlockStore(blocks, await caches.open('blockstore:bytes'), ctx, metrics)
  return env.DENYLIST ? new DenyingBlockStore(env.DENYLIST, cached) : cached
}

export class CachingLocator {
  /**
   * @param {import('@web3-storage/blob-fetcher').Locator} locator
   * @param {Cache} cache
   * @param {ExecutionContext} ctx
   * @param {import('./metrics.js').Metrics} metrics
   */
  constructor (locator, cache, ctx, metrics) {
    this.locator = locator
    this.cache = cache
    this.ctx = ctx
    this.metrics = metrics
  }

  /** @param {import('multiformats').MultihashDigest} digest */
  async locate (digest) {
    const key = this.toCacheKey(digest)
    const cached = await this.cache.match(key)
    if (cached) {
      this.metrics.indexes++
      this.metrics.indexesCached++
      return { ok: Location.decode(new Uint8Array(await cached.arrayBuffer())) }
    }
    const res = await this.locator.locate(digest)
    if (res.ok) {
      this.metrics.indexes++
      this.ctx.waitUntil(this.cache.put(key, new Response(Location.encode(res.ok))))
    }
    return res
  }

  /** @param {import('multiformats').MultihashDigest} digest */
  toCacheKey (digest) {
    const key = base58btc.encode(digest.bytes)
    const cacheUrl = new URL(key, 'https://index.web3.storage')
    return new Request(cacheUrl.toString(), {
      method: 'GET',
      headers: new Headers({ 'content-type': 'application/octet-stream' })
    })
  }
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
      return bytes
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

export class BlockStore {
  /**
   * @param {import('@web3-storage/blob-fetcher').Locator} locator
   * @param {import('./metrics.js').Metrics} metrics
   */
  constructor (locator, metrics) {
    this.fetcher = BatchingFetcher.create(locator)
    this.locator = locator
    this.metrics = metrics
  }

  /** @param {UnknownLink} cid */
  async has (cid) {
    const res = await this.locator.locate(cid.multihash)
    return Boolean(res.ok)
  }

  /** @param {UnknownLink} cid */
  async get (cid) {
    const res = await this.fetcher.fetch(cid.multihash)
    if (res.ok) {
      const bytes = await res.ok.bytes()
      this.metrics.blocksFetched++
      this.metrics.blockBytesFetched += bytes.byteLength
      return bytes
    }
  }
}
