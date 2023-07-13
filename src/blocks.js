import { digest } from 'multiformats'
import { CID } from 'multiformats/cid'
import { base58btc } from 'multiformats/bases/base58'
import { fromString } from 'uint8arrays/from-string'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'

const CAR = 0x202

/**
 * @typedef {object} BlockLocation
 * @property {string} blockmultihash e.g zQmXWxE2sdWFeLHfVEp6bb6kib9YWWEvsaAJSgoExKrPVXD
 * @property {string} carpath e.g us-east-2/dotstorage-staging-0/raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car
 * @property {number} length e.g 58 (bytes)
 * @property {number} offset e.g 96 (bytes)
 */

export class DynamoBlockFinder {
  /**
   * @param {string} table
   * @param {DynamoDBClient} client
   */
  constructor (table, client = DynamoDBDocumentClient.from(new DynamoDBClient({}))) {
    this.table = table
    this.client = client
  }

  /**
   * Return block location infos
   *
   * @param {CID} cid
   */
  async find (cid) {
    const blockmultihash = base58btc.encode(cid.multihash.bytes)
    const res = await this.client.send(new GetCommand({
      TableName: this.table,
      Key: { blockmultihash }
    }))
    if (!res.Item?.carpath) {
      return undefined
    }
    return /** @type {BlockLocation} */ (res.Item)
  }

  /**
   * @param {CID[]} cids
   */
  async findMany (cids) {
    throw new Error('Not Implemented')
  }
}

/**
 * A blockstore that copes with the dag.haus bucket legacy
 */
export class DagHausBlockStore {
  /**
   * @param {DynamoBlockFinder} blockfinder
   * @param {R2Bucket} carpark
   */
  constructor (blockfinder, carpark) {
    this.blockfinder = blockfinder
    this.carpark = carpark
  }

  /**
   * @param {CID} cid
   */
  async has (cid) {
    const loc = await this.blockfinder.find(cid)
    return !!loc
  }

  /**
   * @param {CID} cid
   */
  async get (cid) {
    const loc = await this.blockfinder.find(cid)
    if (!loc) return undefined
    const carKey = toCarKey(loc.carpath)
    if (!carKey) {
      // TODO: fallback to s3
      return undefined
    }
    const obj = await this.carpark.get(carKey, {
      range: {
        offset: loc.offset,
        length: loc.length
      }
    })
    if (!obj) return undefined

    const buff = await obj.arrayBuffer()
    return new Uint8Array(buff)
  }
}

/**
 * Convert legacy carpath to car cid key where possible
 * @param {string} carpath e.g us-east-2/dotstorage-staging-0/raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car
 * @returns {string | undefined} e.g bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq/bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq.car
 */
export function toCarKey (carpath) {
  if (!carpath.endsWith('.car')) {
    return undefined
  }
  const [,, ...keyParts] = carpath.split('/')
  if (keyParts.at(0) === 'raw') {
    const carName = keyParts.at(-1)
    if (!carName) {
      return undefined
    }
    const carCid = toCarCid(carName.slice(0, -4)) // trim .car suffix
    return `${carCid}/${carCid}.car`
  }
  if (keyParts.at(0)?.startsWith('bag')) {
    // already a carKey
    return keyParts.join('/')
  }
}

/**
 * Convert a base32 (without multibase prefix!) sha256 multihash to a CAR CID
 *
 * @param {string} base32Multihash - e.g ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri
 */
export function toCarCid (base32Multihash) {
  const mh = digest.decode(fromString(base32Multihash, 'base32'))
  return CID.create(1, CAR, mh)
}
