import { CARReaderStream } from 'carstream/reader'

/* global ReadableStream */
/* global WritableStream */
/* global TransformStream */

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
    return claimsGetBlock(this.#read, link, this.#url)
  }
}

/**
 * @param {AbstractClaimsClient['read']} read
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @param {URL} [serviceURL] - serviceURL to claims service to read from
 */
async function claimsHas (
  read,
  link,
  serviceURL
) {
  const claims = await read(link, { serviceURL })
  // @todo consider checking the claims themselves
  return Boolean(claims.length)
}

/**
 * get blocks for a link from a content claims client
 * @param {AbstractClaimsClient['read']} read
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @param {URL} [serviceURL] - url to claims service to read from
 * @returns {Promise<Uint8Array|undefined>}
 */
async function claimsGetBlock (read, link, serviceURL) {
  const claims = await read(link, { serviceURL })
  /** @type {import('@web3-storage/content-claims/client/api').LocationClaim[]} */
  const locationClaims = []
  for (const claim of claims) {
    switch (claim.type) {
      case 'assert/location':
        locationClaims.push(claim)
        break
      default:
        console.warn('unexpected claim type. skipping.', claim.type, claim)
        break
    }
  }
  /**
   * @type {ReadableStream<{
   *   claim: import('@web3-storage/content-claims/client/api').LocationClaim
   *   location: string
   *   response: Response
   *   block: import('carstream/api').Block
   * }>}
   */
  const locatedBlocks = await createReadableStream(locationClaims)
    // claim -> [claim, location]
    .pipeThrough(new TransformStream({
      /**
       * @param {import('@web3-storage/content-claims/client/api').LocationClaim} claim
       */
      async transform (claim, controller) {
        for (const location of claim.location) { controller.enqueue([claim, location]) }
      }
    }))
    // [claim, location] -> [claim, location, ok response]
    .pipeThrough(new TransformStream({
      /** @param {[claim: import('@web3-storage/content-claims/client/api').Claim, location: string]} chunk */
      async transform ([claim, location], controller) {
        const response = await fetch(location, { headers: { accept: 'application/vnd.ipld.car' } })
        if (response.ok) {
          return controller.enqueue([claim, location, response])
        }
        throw new Error(`unexpected not-ok response ${response}`)
      }
    }))
    // [claim, location, ok response] -> { claim, location, ok response, block }
    .pipeThrough(new TransformStream({
      /** @param {[claim: import('@web3-storage/content-claims/client/api').LocationClaim, location: string, response: Response]} chunk */
      async transform ([claim, location, response], controller) {
        await response.body?.pipeThrough(new CARReaderStream()).pipeTo(new WritableStream({
          write: (block) => {
            // @todo validate that block.bytes hashes to `link`
            controller.enqueue({ claim, location, response, block })
          }
        }))
      }
    }))
  const block = await locatedBlocks.getReader().read().then(({ done, value }) => value ? value.block.bytes : undefined)
  return block
}

/**
 * @template T
 * @param {Iterable<T>} source
 */
function createReadableStream (source) {
  return new ReadableStream({
    start (controller) {
      for (const item of source) {
        controller.enqueue(item)
      }
      controller.close()
    }
  })
}
