import * as Claims from '@web3-storage/content-claims/client'
import { Map as LinkMap } from 'lnmap'

/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 * @typedef {import('./api.js').IndexEntry} IndexEntry
 * @typedef {import('./api.js').Index} Index
 */

/** @implements {Index} */
export class ContentClaimsIndex {
  /**
   * Cached index entries.
   * @type {Map<UnknownLink, IndexEntry>}
   */
  #cache
  /**
   * CIDs for which we have already fetched claims.
   *
   * Note: _only_ the CIDs which have been explicitly queried, for which we
   * have made a content claim request. Not using `this.#cache` because reading
   * a claim may cause us to add other CIDs to the cache that we haven't read
   * claims for.
   *
   * Note: implemented as a Map not a Set so that we take advantage of the
   * key cache that `lnmap` provides, so we don't duplicate base58 encoded
   * multihash keys.
   * @type {Map<UnknownLink, true>}
   */
  #claimFetched
  /**
   * @type {URL|undefined}
   */
  #serviceURL

  /**
   * @param {{ serviceURL?: URL }} [options]
   */
  constructor (options) {
    this.#cache = new LinkMap()
    this.#claimFetched = new LinkMap()
    this.#serviceURL = options?.serviceURL
  }

  /**
   * @param {UnknownLink} cid
   * @returns {Promise<IndexEntry | undefined>}
   */
  async get (cid) {
    // get the index data for this CID (CAR CID & offset)
    let indexItem = this.#cache.get(cid)
    if (!indexItem) {
      // we not found the index data!
      await this.#readClaims(cid)
      // seeing as we just read the index for this CID we _should_ have some
      // index information for it now.
      indexItem = this.#cache.get(cid)
    }
    return indexItem
  }

  /**
   * Read claims for the passed CID and populate the cache.
   * @param {import('multiformats').UnknownLink} cid
   */
  async #readClaims (cid) {
    if (this.#claimFetched.has(cid)) return

    const claims = await Claims.read(cid, { serviceURL: this.#serviceURL })
    for (const claim of claims) {
      if (claim.type === 'assert/location' && claim.range?.length != null) {
        this.#cache.set(cid, {
          digest: cid.multihash,
          site: {
            location: claim.location.map(l => new URL(l)),
            range: { offset: claim.range.offset, length: claim.range.length }
          }
        })
      }
    }
    this.#claimFetched.set(cid, true)
  }
}
