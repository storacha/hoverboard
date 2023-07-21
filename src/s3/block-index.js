import { QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { base58btc } from 'multiformats/bases/base58'
import retry from 'p-retry'

/**
 * @typedef {{ bucket: string, region: string, key: string, offset: number, length: number }} IndexEntry
 * @typedef {{ get: (cid: import('multiformats').UnknownLink, idxEntries?: IndexEntry[]) => Promise<IndexEntry[]> }} BlockIndex
 */

/** @implements {BlockIndex} */
export class DynamoIndex {
  #client
  #table
  #metrics
  #max
  #preferRegion

  /**
   * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
   * @param {string} table
   * @param {import('../metrics.js').Metrics} metrics
   * @param {object} [options]
   * @param {number} [options.maxEntries] Max entries to return when multiple
   * CAR files contain the same block.
   * @param {string} [options.preferRegion] Preferred region to place first in
   * results.
   */
  constructor (client, table, metrics, options) {
    this.#client = client
    this.#table = table
    this.#metrics = metrics
    this.#max = options?.maxEntries ?? 5
    this.#preferRegion = options?.preferRegion
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @returns {Promise<IndexEntry[]>}
   */
  async get (cid) {
    const command = new QueryCommand({
      TableName: this.#table,
      Limit: this.#max,
      KeyConditions: {
        blockmultihash: {
          ComparisonOperator: 'EQ',
          AttributeValueList: [{ S: base58btc.encode(cid.multihash.bytes) }]
        }
      },
      AttributesToGet: ['carpath', 'length', 'offset']
    })
    const res = await retry(() => {
      return this.#client.send(command)
    }, {
      minTimeout: 100,
      retries: 5,
      onFailedAttempt: err => {
        console.warn(`failed DynamoDB request for: ${cid}`, err)
        if (err.message.startsWith('Too many subrequests')) {
          // rethrow to stop retrying
          throw err
        }
      }
    })
    if (res.$metadata.httpStatusCode && res.$metadata.httpStatusCode >= 200 && res.$metadata.httpStatusCode < 300) {
      this.#metrics.indexes++
    }
    const items = (res.Items ?? []).map(item => {
      const { carpath, offset, length } = unmarshall(item)
      const [region, bucket, ...rest] = carpath.split('/')
      return { region, bucket, key: rest.join('/'), offset, length }
    })
    const region = this.#preferRegion
    if (region) {
      items.sort((a, b) => {
        if (a.region === region && b.region !== region) return -1
        if (a.region !== region && b.region === region) return 1
        return 0
      })
    }
    return items
  }
}

export class CachingIndex {
  /**
   * @param {BlockIndex} index
   * @param {Cache} cache
   * @param {ExecutionContext} ctx
   * @param {import('../metrics.js').Metrics} metrics
   */
  constructor (index, cache, ctx, metrics) {
    this.index = index
    this.cache = cache
    this.ctx = ctx
    this.metrics = metrics
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @returns {Promise<IndexEntry[]>}
   */
  async get (cid) {
    const key = this.toCacheKey(cid)
    const cached = await this.cache.match(key)
    if (cached) {
      this.metrics.indexes++
      this.metrics.indexesCached++
      return cached.json()
    }
    const res = await this.index.get(cid)
    if (res.length > 0) {
      this.metrics.indexes++
      this.ctx.waitUntil(this.cache.put(key, new Response(JSON.stringify(res))))
    }
    return res
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   */
  toCacheKey (cid) {
    const key = base58btc.encode(cid.multihash.bytes)
    const cacheUrl = new URL(key, 'https://dynamo.web3.storage')
    return new Request(cacheUrl.toString(), {
      method: 'GET',
      headers: new Headers({
        'content-type': 'application/json'
      })
    })
  }
}
