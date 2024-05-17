import * as dagCBOR from '@ipld/dag-cbor'
import * as Digest from 'multiformats/hashes/digest'

/** @param {import('./api.js').IndexEntry} entry */
export const encode = entry => dagCBOR.encode({
  digest: entry.digest.bytes,
  site: {
    location: entry.site.location.map(l => l.toString()),
    range: entry.site.range
  }
})

/** @param {Uint8Array} bytes */
export const decode = bytes => {
  const raw = dagCBOR.decode(bytes)
  return {
    digest: Digest.decode(raw.digest),
    site: {
      location: raw.site.location.map((/** @type {string} */l) => new URL(l)),
      range: raw.site.range
    }
  }
}
