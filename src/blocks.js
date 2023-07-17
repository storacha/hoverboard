/* eslint-env serviceworker */
import { S3Client } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { digest } from 'multiformats'
import { CID } from 'multiformats/cid'
import { fromString } from 'uint8arrays/from-string'
import { DynamoIndex, CachingIndex } from './s3/block-index.js'
import { BatchingDynamoBlockstore } from './s3/blockstore.js'
import { DenyingBlockStore } from './deny.js'

const CAR = 0x202

/**
 * @typedef {import('multiformats').UnknownLink} UnknownLink
 * @typedef {import('./worker.js').Env} Env
 *
 * @typedef {object} BlockLocation
 * @property {string} blockmultihash e.g zQmXWxE2sdWFeLHfVEp6bb6kib9YWWEvsaAJSgoExKrPVXD
 * @property {string} carpath e.g us-east-2/dotstorage-staging-0/raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car
 * @property {number} length e.g 58 (bytes)
 * @property {number} offset e.g 96 (bytes)
 *
 * @typedef {object} Blockstore
 * @prop {(cid: UnknownLink) => Promise<boolean>} has
 * @prop {(cid: UnknownLink) => Promise<Uint8Array | undefined>} get
 */

/**
 * @param {Env} env
 * @param {ExecutionContext} ctx
 */
export async function getBlockstore (env, ctx) {
  const dynamo = new DynamoIndex(getDynamoClient(env), env.DYNAMO_TABLE, { maxEntries: 3 })
  const index = new CachingIndex(dynamo, await caches.open(`dynamo:${env.DYNAMO_TABLE}`), ctx)
  const s3 = new BatchingDynamoBlockstore(index, getS3Clients(env))
  const r2 = new DagHausBlockStore(index, env.CARPARK, s3)
  const cached = new CachingBlockStore(r2, await caches.open('blockstore:bytes'), ctx)
  return env.DENYLIST ? new DenyingBlockStore(env.DENYLIST, cached) : cached
}

export class CachingBlockStore {
  /**
   * @param {import('./deny.js').Blockstore} blockstore
   * @param {Cache} cache
   * @param {ExecutionContext} ctx
   */
  constructor (blockstore, cache, ctx) {
    this.blockstore = blockstore
    this.cache = cache
    this.ctx = ctx
  }

  /**
   * @param {UnknownLink} cid
   * */
  async has (cid) {
    const key = this.toCacheKey(cid)
    const cached = await this.cache.match(key)
    if (cached) return true
    return this.blockstore.has(cid)
  }

  /**
   * @param {UnknownLink} cid
   * */
  async get (cid) {
    const key = this.toCacheKey(cid)
    const cached = await this.cache.match(key)
    if (cached) {
      console.log('cached block', key.url)
      const buff = await cached.arrayBuffer()
      return new Uint8Array(buff)
    }
    const res = await this.blockstore.get(cid)
    if (res) {
      this.ctx.waitUntil(this.cache.put(key, new Response(res).clone()))
      return res
    }
  }

  /**
   * @param {UnknownLink} cid
   */
  toCacheKey (cid) {
    const cacheUrl = new URL(`/ipfs/${cid}?format=raw`, 'https://ipfs.io')
    return new Request(cacheUrl.toString(), {
      method: 'GET'
    })
  }
}

/**
 * A blockstore that copes with the dag.haus bucket legacy
 */
export class DagHausBlockStore {
  /**
   * @param {import('./s3/block-index.js').BlockIndex} dynamo
   * @param {R2Bucket} carpark
   * @param {BatchingDynamoBlockstore} s3
   */
  constructor (dynamo, carpark, s3) {
    this.dynamo = dynamo
    this.carpark = carpark
    this.s3 = s3
  }

  /**
   * Check for dynamo index. Soon to be content clams.
   * @param {UnknownLink} cid
   */
  async has (cid) {
    // TODO: check denylist
    const res = await this.dynamo.get(cid)
    return res.length > 0
  }

  /**
   * Try R2. Fallback to S3.
   * @param {UnknownLink} cid
   */
  async get (cid) {
    // TODO: check denylist
    const idxEntries = await this.dynamo.get(cid)
    if (idxEntries.length === 0) return

    for (const { key, offset, length } of idxEntries) {
      const carKey = toCarKey(key)
      if (carKey && this.carpark) {
        const obj = await this.carpark.get(carKey, { range: { offset, length } })
        if (obj) {
          console.log(`got ${cid} from R2 bytes=${offset}-${offset + length - 1}`)
          const buff = await obj.arrayBuffer()
          return new Uint8Array(buff)
        }
      }
    }

    // fallback to s3
    const block = await this.s3.get(cid, idxEntries)
    if (!block) return undefined
    return block.bytes
  }
}

/**
 * Convert legacy key to car cid key where possible
 * @param {string} key raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car
 * @returns {string | undefined} e.g bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq/bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq.car
 */
export function toCarKey (key) {
  if (!key.endsWith('.car')) {
    return undefined
  }
  const keyParts = key.split('/')
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

/**
 * @param {Env} env
 */
export function getDynamoClient (env) {
  if (!env.DYNAMO_REGION) throw new Error('missing environment variable: DYNAMO_REGION')
  if (!env.DYNAMO_TABLE) throw new Error('missing environment variable: DYNAMO_TABLE')
  const credentials = getAwsCredentials(env)
  const endpoint = env.DYNAMO_ENDPOINT
  return new DynamoDBClient({ endpoint, region: env.DYNAMO_REGION, credentials })
}

/**
 * @param {Env} env
 */
export function getS3Clients (env) {
  const regions = env.S3_REGIONS ? env.S3_REGIONS.split(',') : ['us-west-2', 'us-east-1', 'us-east-2']
  const endpoint = env.S3_ENDPOINT
  const credentials = getAwsCredentials(env)
  const config = { endpoint, forcePathStyle: !!endpoint, credentials }
  return Object.fromEntries(regions.map(r => [r, new S3Client({ ...config, region: r })]))
}

/** @param {Env} env */
function getAwsCredentials (env) {
  const accessKeyId = env.AWS_ACCESS_KEY_ID
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
}
