import * as dagCBOR from '@ipld/dag-cbor'
import * as Digest from 'multiformats/hashes/digest'

/** @param {import('@web3-storage/blob-fetcher').Location} entry */
export const encode = entry => dagCBOR.encode({
  digest: entry.digest.bytes,
  site: entry.site.map(s => ({
    location: s.location.map(l => l.toString()),
    range: s.range
  }))
})

/** @param {Uint8Array} bytes */
export const decode = bytes => {
  const raw = dagCBOR.decode(bytes)
  return {
    digest: Digest.decode(raw.digest),
    site: raw.site.map((/** @type {any} */ s) => ({
      location: s.location.map((/** @type {string} */l) => new URL(l)),
      range: s.range
    }))
  }
}
