import { MultihashDigest, UnknownLink } from 'multiformats'
import { ByteRange } from '@web3-storage/content-claims/client/api'

/**
 * An index entry where the exact location of the block (URL and byte offset +
 * length) has been found via a content claim.
 */
export interface IndexEntry {
  digest: MultihashDigest
  site: {
    location: URL[]
    range: Required<ByteRange>
  }
}

export interface Index {
  get (c: UnknownLink): Promise<IndexEntry|undefined>
}
