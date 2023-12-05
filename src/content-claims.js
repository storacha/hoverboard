import * as Claims from '@web3-storage/content-claims/client'
import { CID } from 'multiformats'

/**
 * @typedef {import('carstream/api').Block & { children: import('multiformats').UnknownLink[] }} RelationIndexData
 * @typedef {Map<import('multiformats').UnknownLink, import('carstream/api').Block[]>} Claims
 * @typedef {{ setClaims: (c: Claims) => void, close: () => void, port: number, signer: import('@ucanto/interface').Signer }} MockClaimsService
 * @typedef {import('@web3-storage/content-claims/server/api').ClaimStore} ClaimStore
 */

export class ContentClaimsReadResponder {
  /**
   * construct a
   * @param {URL|string} urlOrPath
   */
  static route (
    urlOrPath,
    // paths like '/dns/{contentClaimsDns}/content-claims/{cid}'
    dnsCidPattern = /\/dns\/([^/]+)\/content-claims\/([^/]+)$/,
    // paths like /claims?from=url&about=cid
    claimsPathPattern = /^\/claims\/$/
  ) {
    const url = (typeof urlOrPath === 'string') ? new URL(urlOrPath, new URL('https://example.com')) : urlOrPath
    const dnsCidMatch = url.pathname.match(dnsCidPattern)
    if (dnsCidMatch) {
      const claimsLocation = new URL(`https://${dnsCidMatch[1]}/`)
      const cid = CID.parse(dnsCidMatch[2])
      return new ContentClaimsReadResponder(claimsLocation, cid)
    }
    const claimsPathMatch = url.pathname.match(claimsPathPattern)
    if (claimsPathMatch) {
      const searchParams = new URL(urlOrPath, new URL('http://example.com')).searchParams
      const sourceString = searchParams.get('source')
      const source = sourceString ? new URL(sourceString) : undefined
      const aboutString = searchParams.get('about')
      const cid = aboutString && CID.parse(aboutString)
      if (source && cid) {
        return new ContentClaimsReadResponder(source, cid)
      }
    }
  }

  /**
   * @param {URL} claims - URL to content claims service
   * @param {CID} cid - cid to retrieve front content claims service
   */
  constructor (claims, cid) {
    this.claims = claims
    this.cid = cid
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async respond (request) {
    const { cid } = this
    const claims = await Claims.read(cid, { serviceURL: this.claims })
    const collection = {
      name: `claims for ${cid}`,
      totalItems: claims.length,
      items: claims
    }
    return new Response(JSON.stringify(collection), { status: 200 })
  }
}
