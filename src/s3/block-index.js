import { QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { base58btc } from 'multiformats/bases/base58'
import retry from 'p-retry'

/**
 * @typedef {{ bucket: string, region: string, key: string, offset: number, length: number }} IndexEntry
 * @typedef {{ get: (cid: import('multiformats').UnknownLink) => Promise<IndexEntry[]> }} BlockIndex
 */

/** @implements {BlockIndex} */
export class DynamoIndex {
  #client
  #table
  #max
  #preferRegion

  /**
   * @param {import('@aws-sdk/client-dynamodb').DynamoDBClient} client
   * @param {string} table
   * @param {object} [options]
   * @param {number} [options.maxEntries] Max entries to return when multiple
   * CAR files contain the same block.
   * @param {string} [options.preferRegion] Preferred region to place first in
   * results.
   */
  constructor (client, table, options) {
    this.#client = client
    this.#table = table
    this.#max = options?.maxEntries ?? 5
    this.#preferRegion = options?.preferRegion
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @returns {Promise<IndexEntry[]>}
   */
  async get (cid) {
    const res = await retry(async () => {
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
      return await this.#client.send(command)
    }, { minTimeout: 100, onFailedAttempt: err => console.warn(`failed DynamoDB request for: ${cid}`, err) })
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
