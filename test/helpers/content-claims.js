import { Assert } from '@web3-storage/content-claims/capability'
import * as Claim from '@storacha/indexing-service-client/claim'

/**
 * @import { MultihashDigest, UnknownLink, Link } from 'multiformats'
 * @import { Claim as ClaimView } from '@storacha/indexing-service-client/api'
 * @import { URI } from '@ucanto/interface'
 */

/**
 * @typedef {Map<import('multiformats').UnknownLink, import('carstream/api').Block[]>} Claims
 * @typedef {{
 *   url: URL
 *   close: () => Promise<void>
 *   signer: import('@ucanto/interface').Signer
 *   setClaims: (c: Claims) => void
 *   getCallCount: () => number
 *   resetCallCount: () => void
 * }} MockClaimsService
 */

/**
 * @param {import('@ucanto/interface').Signer} issuer
 * @param {{
 *   root: UnknownLink
 *   shards: Array<{ digest: MultihashDigest, site: URI }>
 *   index: { cid: Link, site: URI }
 * }} info
 */
export const generateClaims = async (issuer, { root, shards, index }) => {
  /** @type {ClaimView[]} */
  const claims = []
  const indexClaim = await Assert.index.delegate({
    issuer,
    audience: issuer,
    with: issuer.did(),
    nb: {
      content: root,
      index: index.cid
    }
  })
  claims.push(Claim.from(indexClaim))

  const indexLocation = await Assert.location.delegate({
    issuer,
    audience: issuer,
    with: issuer.did(),
    nb: {
      content: index.cid,
      location: [index.site]
    }
  })
  claims.push(Claim.from(indexLocation))

  for (const { digest, site } of shards) {
    const shardLocation = await Assert.location.delegate({
      issuer,
      audience: issuer,
      with: issuer.did(),
      nb: {
        content: { digest: digest.bytes },
        location: [site]
      }
    })
    claims.push(Claim.from(shardLocation))
  }

  return claims
}
