/* eslint-env browser */
import * as Link from 'multiformats/link'
import { sha256 } from 'multiformats/hashes/sha2'
import { base58btc } from 'multiformats/bases/base58'
import { UnixFS, ShardingStream } from '@storacha/upload-client'
import * as ShardedDAGIndexUtil from '@storacha/blob-index/util'

/** @import { URI } from '@ucanto/interface' */

const carCode = 0x0202

export class Builder {
  #bucket
  #endpoint

  /**
   * @param {{ put: (key: string, value: Uint8Array) => Promise<unknown> }} bucket
   * @param {URL} endpoint
   */
  constructor (bucket, endpoint) {
    this.#bucket = bucket
    this.#endpoint = endpoint
  }

  /**
   * @param {import('@storacha/upload-client/types').BlobLike|import('@storacha/upload-client/types').FileLike[]} input
   * @param {import('@storacha/upload-client/types').ShardingOptions} [options]
   */
  async add (input, options = {}) {
    console.log('Adding ' + (Array.isArray(input) ? `${input.length} file(s)` : '1 blob') + '...')
    const unixFsEncoder = Array.isArray(input)
      ? UnixFS.createDirectoryEncoderStream(input)
      : UnixFS.createFileEncoderStream(input)

    /** @type {import('multiformats').UnknownLink[]} */
    const blockLinks = []
    /** @type {import('multiformats').Link[]} */
    const shards = []
    /** @type {Uint8Array[]} */
    const shardArchives = []
    await unixFsEncoder
      .pipeThrough(new TransformStream({
        transform (block, controller) {
          blockLinks.push(block.cid)
          controller.enqueue(block)
        }
      }))
      .pipeThrough(new ShardingStream(options))
      .pipeTo(new WritableStream({
        write: async car => {
          const bytes = new Uint8Array(await car.arrayBuffer())
          const digest = await sha256.digest(bytes)
          await this.#bucket.put(toBlobKey(digest), bytes)
          shards.push(Link.create(carCode, digest))
          shardArchives.push(bytes)
        }
      }))

    const root = blockLinks[blockLinks.length - 1]
    const index = await ShardedDAGIndexUtil.fromShardArchives(root, shardArchives)
    const archiveRes = await index.archive()
    if (archiveRes.error) {
      throw new Error('failed to archive index', { cause: archiveRes.error })
    }
    const indexDigest = await sha256.digest(archiveRes.ok)
    const indexLink = Link.create(carCode, indexDigest)
    await this.#bucket.put(toBlobKey(indexDigest), archiveRes.ok)

    return {
      root,
      shards: shards.map(s => ({
        digest: s.multihash,
        site:
          /** @type {URI} */
          (new URL(toBlobKey(s.multihash), this.#endpoint).toString())
      })),
      index: {
        cid: indexLink,
        site:
          /** @type {URI} */
          (new URL(toBlobKey(indexLink.multihash), this.#endpoint).toString())
      }
    }
  }
}

/** @param {import('multiformats').MultihashDigest} digest */
const toBlobKey = digest => {
  const digestString = base58btc.encode(digest.bytes)
  return `${digestString}/${digestString}.blob`
}
