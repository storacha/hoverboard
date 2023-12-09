import { CARReaderStream } from 'carstream/reader'
import * as CAR from './car.js'

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
  /** @type {Map<string, Uint8Array>}  */
  #carpark

  /**
   * @param {object} options
   * @param {AbstractClaimsClient['read']} options.read
   * @param {Map<string, Uint8Array>} [options.carpark] - keys like `${cid}/${cid}.car` and values are car bytes
   * @param {URL} [options.url]
   */
  constructor ({ read, url, carpark = new Map() }) {
    this.#read = read
    this.#url = url
    this.#carpark = carpark
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
    return claimsGetBlock(this.#read, link, this.#url, this.#carpark)
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
 * @param {Map<string, Uint8Array>} [carpark] - keys like `${cid}/${cid}.car` and values are car bytes
 * @returns {Promise<Uint8Array|undefined>}
 */
async function claimsGetBlock (read, link, serviceURL, carpark = new Map()) {
  const claims = await read(link, { serviceURL })
  /** @type {import('@web3-storage/content-claims/client/api').LocationClaim[]} */
  const locationClaims = []
  /** @type {import('@web3-storage/content-claims/client/api').RelationClaim[]} */
  const relationClaims = []
  for (const claim of claims) {
    switch (claim.type) {
      case 'assert/location':
        locationClaims.push(claim)
        break
      case 'assert/relation':
        relationClaims.push(claim)
        break
      default:
        console.warn('unexpected claim type. skipping.', claim.type, claim)
        break
    }
  }
  for (const relationClaim of relationClaims) {
    // export the blocks from the claim - may include the CARv2 indexes
    const blocks = [...relationClaim.export()]

    // each part is a tuple of CAR CID (content) & CARv2 index CID (includes)
    for (const { content, includes } of relationClaim.parts) {
      if (content.code !== CAR.code) continue
      if (!includes) continue

      /** @type {{ cid: import('multiformats').UnknownLink, bytes: Uint8Array }|undefined} */
      let block = blocks.find(b => b.cid.toString() === includes.content.toString())

      console.log('claimsGetBlock first', block, includes.parts)
      // if the index is not included in the claim, it should be in CARPARK
      if (!block && includes.parts?.length) {
        console.log('looking in carpark for', includes.parts[0], carpark)
        const obj = await carpark.get(`${includes.parts[0]}/${includes.parts[0]}.car`)
        if (!obj) continue
        const blocks = await CAR.decode(obj)
        block = blocks.find(b => b.cid.toString() === includes.content.toString())
      }
      console.log('relation got block', block)
      if (block) {
        return block.bytes
      }
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
