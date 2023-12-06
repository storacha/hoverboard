/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 */

/**
 * a store of ipld blocks that be fetched by CID
 */
export class AbstractBlockStore {
  /**
   * @param {UnknownLink} link
   * @returns {Promise<Uint8Array|undefined>}
   */
  async get (link) {
    throw new Error('not implemented')
  }

  /**
   * @param {UnknownLink} link
   * @returns {Promise<boolean>}
   */
  async has (link) {
    throw new Error('not implemented')
  }
}

/**
 * interface of `import * as ContentClaims from "@web3-storage/content-claims"`
 */
export class AbstractClaimsClient {
  /**
   * @param {UnknownLink} link
   * @param {import('@web3-storage/content-claims/client').FetchOptions} options
   * @returns {Promise<import('@web3-storage/content-claims/client/api').Claim[]>}
   */
  async read (link, options = {}) {
    throw new Error('not implemented')
  }
}

/**
 * @implements {AbstractBlockStore}
 */
export class ContentClaimsBlockstore {
  /** @type {AbstractClaimsClient['read']} */
  #read
  /** @type {URL|undefined} */
  #url
  /**
   * @param {object} options
   * @param {AbstractClaimsClient['read']} options.read
   * @param {URL} [options.url]
   */
  constructor ({ read, url }) {
    this.#read = read
    this.#url = url
  }

  /**
   * @param {UnknownLink} link
   */
  async has (link) {
    return claimsHas(this.#read, link, this.#url)
  }

  /**
   * @param {UnknownLink} link
   */
  async get (link) {
    return undefined
  }
}

/**
 * @param {AbstractClaimsClient['read']} read
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @param {URL} [url] - url to claims service to read from
 */
async function claimsHas (
  read,
  link,
  url
) {
  const claims = await read(link, { serviceURL: url })
  // @todo consider checking the claims themselves
  return Boolean(claims.length)
}
