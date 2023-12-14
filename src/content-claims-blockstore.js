import { CARReaderStream } from 'carstream/reader'
import * as CAR from './car.js'
import { MultihashIndexSortedReader } from 'cardex/multihash-index-sorted'
import assert from 'assert'
import { CID } from 'multiformats'
import * as Link from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import * as freewayBlockstore from 'freeway/blockstore'
import {Map as LinkMap} from 'lnmap'


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
 * get index for a link from a content claims client
 * @param {AbstractClaimsClient['read']} read
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @param {URL} [serviceURL] - url to claims service to read from
 * @param {Map<string, Uint8Array>} [carpark] - keys like `${cid}/${cid}.car` and values are car bytes
 * @param {LinkMap<UnknownLink, IndexEntry>} [index] - map of
 * @returns {Promise<Uint8Array|undefined>}
 */
async function claimsGetBlock (read, link, serviceURL, carpark = new Map(), index = new LinkMap()) {
  const claims = await read(link, { serviceURL })
  /** @type {import('@web3-storage/content-claims/client/api').LocationClaim[]} */
  const locationClaims = []
  /** @type {import('@web3-storage/content-claims/client/api').RelationClaim[]} */
  const relationClaims = []
  for (const claim of claims) {
    switch (claim.type) {
      case 'assert/location':
        // @ts-ignore
        locationClaims.push(claim)
        break
      case 'assert/relation':
        // @ts-ignore
        relationClaims.push(claim)
        break
      default:
        console.warn('unexpected claim type. skipping.', claim.type, claim)
        break
    }
  }

  for (const relationClaim of relationClaims) {
    console.debug('relationClaim', JSON.stringify(relationClaim, undefined, 2))

    // export the blocks from the claim - may include the CARv2 indexes
    const blocks = [...relationClaim.export()]

    const relationClaimPartBlocks = []

    // each part is a tuple of CAR CID (content) & CARv2 index CID (includes)
    for (const { content, includes } of relationClaim.parts) {
      if (content.code !== CAR.code) continue
      if (!includes) continue

      assert.ok(includes.content.code === MultihashIndexSortedReader.codec, 'relationClaim.includes is link to car-multihash-index-sorted')

      /** @type {{ cid: import('multiformats').UnknownLink, bytes: Uint8Array }|undefined} */
      let indexBlock = blocks.find(b => b.cid.equals(includes.content))

      // if the index is not included in the claim, it should be in CARPARK
      if (!indexBlock && includes.parts?.length) {
        const includeParts = []
        for (const part of includes.parts) {
          // part is a CARLink to a car-multihash-index-sorted
          const partCarParkPath = `${part}/${part}.car`
          const obj = await carpark.get(partCarParkPath)
          if (!obj) continue
          const partBlocks = await CAR.decode(obj)
          includeParts.push(...partBlocks)
          // console.debug('decoded part car to partBlocks', partBlocks)
          // console.debug('all parts should come to', content, includes.parts)
          // console.debug('all blocks', blocks)
          indexBlock = indexBlock ?? partBlocks.find(b => b.cid.equals(includes.content))
          console.debug('end part loop', {
            part,
            blockForIncludes: indexBlock,
            partBlocks,
            includeParts
          })
          if (indexBlock) {
            console.debug('got blockForIncludes. skipping further includes.parts')
            break
          }
        }
      }

      if (indexBlock) {
        console.debug('blockForIncludes', indexBlock)
        assert.ok(indexBlock.cid.code === MultihashIndexSortedReader.codec)
        const cidV1 = CID.create(1, MultihashIndexSortedReader.codec, indexBlock.cid.multihash)
        assert.ok(cidV1.code === MultihashIndexSortedReader.codec)
        const includesContentCidCode = content.code
        assert.ok(includesContentCidCode === CAR.code, 'includesContentCidCode in CAR.code')
        const includesContentCidV1 = CID.create(1, includesContentCidCode, content.multihash)
        for await (const entry of decodeRelationIncludesIndex(includesContentCidV1, indexBlock.bytes)) {
          const entryIndexKey = Link.create(raw.code, entry.multihash)
          index.set(entryIndexKey, entry)
        }
        relationClaimPartBlocks.push(indexBlock)
      }

      // ok maybe now the index has the cid we were originally looking for?
      if (index.has(link)) {
        console.debug(`now have index for link`, { link, index })
        throw new Error(`found index for the link we're resolving. But need to convert to find the corresponding block.`)
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
  const locatedBlocks = createReadableStream(locationClaims)
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

/**
 * @typedef {import('./api.js').IndexEntry} IndexEntry
 * @typedef {import('./api.js').Index} Index
 */

/**
 * Read a MultihashIndexSorted index for the passed origin CAR and return a
 * list of IndexEntry.
 * @param {import('cardex/api').CARLink} origin
 * @param {Uint8Array} bytes
 */
const decodeRelationIncludesIndex = async function * (origin, bytes) {
  const readable = new ReadableStream({
    pull (controller) {
      controller.enqueue(bytes)
      controller.close()
    }
  })
  const reader = MultihashIndexSortedReader.createReader({ reader: readable.getReader() })
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    yield (/** @type {IndexEntry} */({ origin, ...value }))
  }
}
