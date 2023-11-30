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
    const cid = match[2]
    return new ContentClaimsReadResponder(claimsServiceDns, cid)
  }

  /**
   *
   * @param {string} contentClaimsDns - dns of content claims service
   * @param {string} cid - cid to retrieve front content claims service
   */
  constructor (contentClaimsDns, cid) {
    this.contentClaimsDns = contentClaimsDns
    this.cid = cid
  }

  /**
   * @param {Request} request
   * @returns {Response}
   */
  respond (request) {
    return new Response('hi ben, responding from ContentClaimsResponder', { status: 200 })
  }
}
