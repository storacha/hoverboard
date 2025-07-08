import http from 'node:http'
import { DigestMap } from '@storacha/blob-index'
import { extract } from '@storacha/blob-index/sharded-dag-index'
import * as Digest from 'multiformats/hashes/digest'
import { base58btc } from 'multiformats/bases/base58'
import * as QueryResult from '@storacha/indexing-service-client/query-result'

/**
 * @import { ShardedDAGIndexView } from '@storacha/blob-index/types'
 * @import { Claim, Kind } from '@storacha/indexing-service-client/api'
 * @import { MultihashDigest } from 'multiformats'
 */

/**
 * @typedef {{
 *   get: (digest: MultihashDigest) => Claim[]
 *   put: (claim: Claim) => void
 * }} ClaimStore
 * @typedef {{
 *   url: URL
 *   server: http.Server
 *   claimStore: ClaimStore
 * }} MockIndexingService
 */

export const create = async () => {
  const claimStore = new ClaimStorage()
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '', serviceURL)
    const hashes = url.searchParams
      .getAll('multihash')
      .map((hash) => Digest.decode(base58btc.decode(hash)))

    const kind = url.searchParams.get('kind') || 'standard'
    if (!isKind(kind)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('kind must be a string')
      return
    }

    /** @type {{ hash: MultihashDigest, kind: Kind, indexForMh?: MultihashDigest }[]} */
    const jobs = hashes.map((hash) => ({ hash, kind }))

    /** @type {Record<Kind, Claim['type'][]>} */
    const claimMatches = {
      index_or_location: ['assert/location', 'assert/index'],
      location: ['assert/location'],
      standard: ['assert/index', 'assert/location', 'assert/equals']
    }
    /** @type {Claim[]} */
    let claims = []
    /** @type {Map<string, ShardedDAGIndexView>} */
    const indexes = new Map()
    for (;;) {
      const job = jobs.shift()
      if (!job) break
      const matchedClaims = []
      for (const claim of claimStore.get(job.hash)) {
        if (claimMatches[job.kind].includes(claim.type)) {
          matchedClaims.push(claim)
        }
      }
      claims = claims.concat(matchedClaims)
      for (const claim of matchedClaims) {
        switch (claim.type) {
          case 'assert/index':
            jobs.push({ hash: claim.index.multihash, kind: 'index_or_location', indexForMh: job.hash })
            break
          case 'assert/location':
            if (job.indexForMh !== undefined) {
              /** @type {HeadersInit} */
              const headers = {}
              if (claim.range) {
                const { offset, length } = claim.range
                headers.Range = `bytes=${offset}-${length ? offset + length - 1 : ''}`
              }
              const indexRes = await fetch(claim.location[0], { headers })
              if (indexRes.status >= 200 && indexRes.status < 300) {
                const result = extract(await indexRes.bytes())
                if (result.ok) {
                  indexes.set(base58btc.encode(job.hash.bytes), result.ok)
                  result.ok.shards.forEach((shardIndex, hash) => {
                    if (job.indexForMh && shardIndex.has(job.indexForMh)) {
                      jobs.push({ hash, kind: 'index_or_location' })
                    }
                  })
                }
              }
            }
        }
      }
    }
    const qr = await QueryResult.from({ claims, indexes })
    if (qr.error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(qr.error.message)
      return
    }
    const archive = await qr.ok.archive()
    if (archive.error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(archive.error.message)
      return
    }
    res.end(archive.ok)
  })
  await new Promise(resolve => server.listen(resolve))
  // @ts-expect-error
  const { port } = server.address()
  const serviceURL = new URL(`http://127.0.0.1:${port}`)
  return { url: serviceURL, server, claimStore }
}

/**
 * @param {string} str
 * @returns {str is Kind}
 */
const isKind = (str) => ['index_or_location', 'location', 'standard'].includes(str)

/** @param {Claim} claim */
const contentDigest = (claim) =>
  'digest' in claim.content ? Digest.decode(claim.content.digest) : claim.content.multihash

/** @implements {ClaimStore} */
class ClaimStorage {
  constructor () {
    /** @type {DigestMap<MultihashDigest, Claim[]>} */
    this.data = new DigestMap()
  }

  /** @param {Claim} claim */
  put (claim) {
    const digest = contentDigest(claim)
    const claims = this.data.get(digest) ?? []
    claims.push(claim)
    this.data.set(digest, claims)
  }

  /** @param {MultihashDigest} content */
  get (content) {
    return this.data.get(content) ?? []
  }
}
