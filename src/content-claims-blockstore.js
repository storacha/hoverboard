import { CARReaderStream } from 'carstream/reader'
import * as CAR from './car.js'
import { MultihashIndexSortedReader } from 'cardex/multihash-index-sorted'
import assert from 'assert'
import { CID } from 'multiformats'
import * as Link from 'multiformats/link'
import * as raw from 'multiformats/codecs/raw'
import { asyncIterableReader, readBlockHead } from '@ipld/car/decoder'

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
    const claims = await this.#read(link, { serviceURL: this.#url })
    // eslint-disable-next-line no-unreachable-loop
    for await (const block of claimsGetBlock(claims, link, this.#carpark)) {
      return block
    }
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
 * @param {Map<string, Promise<IndexEntry|undefined>>} map - keys are CID strings
 * @returns {import('./api.js').IndexMap & Index}
 */
function createIndexEntryMap (map = new Map()) {
  return {
    get: async (key) => {
      return map.get(key.toString())
    },
    has: async (key) => {
      const hasKey = map.has(key.toString())
      return hasKey
    },
    set: async (key, value) => {
      map.set(key.toString(), Promise.resolve(value))
    }
  }
}

/**
 * get index for a link from a content claims client
 * @param {AsyncIterable<import('./api.js').LocationClaim>|Iterable<import('./api.js').LocationClaim>} claims
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @returns {AsyncGenerator<Uint8Array>}
 */
async function * fetchBlocksForLocationClaims (claims, link) {
  /**
   * @type {ReadableStream<{
   *   claim: import('@web3-storage/content-claims/client/api').LocationClaim
   *   location: string
   *   response: Response
   *   block: import('carstream/api').Block
   * }>}
   */
  const locatedBlocks = createReadableStream(claims)
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
  for await (const locatedBlock of locatedBlocks) {
    yield locatedBlock.block.bytes
  }
}

/**
 * @param {import('./api.js').RelationClaim[]} claims
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @param {Map<string, Uint8Array>} carpark - keys like `${cid}/${cid}.car` and values are car bytes
 * @param {Index & import('./api.js').IndexMap} index - map of
 * @returns {AsyncGenerator<Uint8Array>}
 */
async function * fetchBlocksForRelationClaims (claims, link, carpark, index) {
  for await (const claim of claims) {
    const blocks = [...claim.export()]

    const relationClaimPartBlocks = []

    // each part is a tuple of CAR CID (content) & CARv2 index CID (includes)
    for (const { content, includes } of claim.parts) {
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
          indexBlock = indexBlock ?? partBlocks.find(b => b.cid.equals(includes.content))
          if (indexBlock) {
            // we found the indexBlock we need. No need to keep looping over parts
            break
          }
        }
      }

      // we have a block for the whole Index linked from the relationClaim
      // attempt to decode the index entries from the block and add them to the `index` map
      if (indexBlock) {
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
      if (await index.has(link)) {
        /** @type {import('./api.js').KVBucketWithRangeQueries} */
        const r2Map = {
          async get (key, { range }) {
            const bytes = carpark.get(key)
            if (!bytes) return new Response(null)
            if (!(('offset' in range) && typeof range.offset === 'number')) {
              throw new Error('unexpected range options missing offset')
            }
            const rangeOffset = range.offset
            const view = new DataView(bytes.buffer, bytes.byteOffset + rangeOffset, bytes.byteLength - rangeOffset)
            return new Response(view)
          }
        }
        const blockstore = new R2Blockstore(r2Map, index)
        const block = await blockstore.get(link)
        if (block) {
          yield block.bytes
        }
      }
    }
  }
}

/**
 * get index for a link from a content claims client
 * @param {AsyncIterable<import('./api.js').Claim>|Iterable<import('./api.js').Claim>} claims
 * @param {UnknownLink} link - link to answer whether the content-claims at `url` has blocks for `link`
 * @param {Map<string, Uint8Array>} [carpark] - keys like `${cid}/${cid}.car` and values are car bytes
 * @param {Index & import('./api.js').IndexMap} [index] - map of
 * @returns {AsyncGenerator<Uint8Array>}
 */
async function * claimsGetBlock (claims, link, carpark = new Map(), index = createIndexEntryMap()) {
  for await (const claim of claims) {
    switch (claim.type) {
      case 'assert/location':
        yield * fetchBlocksForLocationClaims([claim], link)
        break
      case 'assert/relation':
        yield * fetchBlocksForRelationClaims([claim], link, carpark, index)
        break
      default:
        // donno about this claim type
        continue
    }
  }
}

/**
 * @template T
 * @param {Iterable<T>|AsyncIterable<T>} source
 */
function createReadableStream (source) {
  return new ReadableStream({
    async start (controller) {
      for await (const item of source) {
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

/**
 * A blockstore that is backed by an R2 bucket which contains CARv2
 * MultihashIndexSorted indexes alongside CAR files. It can read DAGs split
 * across multiple CARs.
 */
export class R2Blockstore {
  /**
   * @param {import('./api.js').KVBucketWithRangeQueries} dataBucket
   * @param {import('./api.js').Index} index
   */
  constructor (dataBucket, index) {
    this._dataBucket = dataBucket
    this._idx = index
  }

  /** @param {UnknownLink} cid */
  async get (cid) {
    const entry = await this._idx.get(cid)
    if (!entry) return
    const carPath = `${entry.origin}/${entry.origin}.car`
    const range = { offset: entry.offset }
    const res = await this._dataBucket.get(carPath, { range })
    if (!res) return

    const reader = res.body?.getReader()
    const bytesReader = asyncIterableReader((async function * () {
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    })())

    const blockHeader = await readBlockHead(bytesReader)
    const bytes = await bytesReader.exactly(blockHeader.blockLength)
    reader?.cancel()
    return { cid, bytes }
  }
}
