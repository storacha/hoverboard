import * as Claims from '@web3-storage/content-claims/client'
import { CID } from 'multiformats'

export class ContentClaimsReadResponder {
  /**
   * construct a
   * @param {URL|string} urlOrPath
   */
  static route (
    urlOrPath,
    // paths like '/dns/{contentClaimsDns}/content-claims/{cid}'
    pathPattern = /\/dns\/([^/]+)\/content-claims\/([^/]+)$/
  ) {
    const pathname = (typeof urlOrPath === 'string') ? urlOrPath : urlOrPath.pathname
    const match = pathname.match(pathPattern)
    console.warn('routing', pathname, match)
    if (!match) return
    const claimsServiceDns = match[1]
    const claimsLocation = new URL(`https://${claimsServiceDns}/`)
    const cid = CID.parse(match[2])
    return new ContentClaimsReadResponder(claimsLocation, cid)
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
    console.debug(`got claims from ${this.claims.toString()}`, claims)
    const collection = {
      name: `claims for ${cid}`,
      totalItems: claims.length
    }
    return new Response(JSON.stringify(collection), { status: 200 })
  }
}
