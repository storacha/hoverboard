const MAX_BYTES_BETWEEN = 1024 * 1024 * 2
const MAX_BATCH_SIZE = 10

/**
 * @typedef {{ region: string, bucket: string, key: string }} ObjectID
 * @typedef {{ offset: number, length: number }} Range
 * @typedef {ObjectID & Range} BlockLocation
 * @typedef {{ cid: import('multiformats').UnknownLink } & ObjectID & Range} BatchItem
 * @typedef {{
 *   add: (cid: import('multiformats').UnknownLink, i: BlockLocation[]) => void
 *   remove: (cid: import('multiformats').UnknownLink) => void
 *   next: () => BatchItem[]
 * }} BlockBatcher
 */

/**
 * Batcher for blocks in CARs. Batches are grouped by ObjectID and blocks are
 * returned in batches in the order they were inserted.
 * @implements {BlockBatcher}
 */
export class OrderedCarBlockBatcher {
  /** @type {BatchItem[]} */
  #queue = []

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @param {BlockLocation[]} locations
   */
  add (cid, locations) {
    if (!locations.length) throw new Error('missing locations')
    const last = this.#queue.at(-1)
    if (!last) return this.#queue.push({ cid, ...locations[0] })
    // find a location in the same CAR as the previously added location
    const loc = locations.find(l => isSameCar(l, last)) ?? locations[0]
    this.#queue.push({ cid, ...loc })
  }

  /** @param {import('multiformats').UnknownLink} cid */
  remove (cid) {
    this.#queue = this.#queue.filter(item => item.cid.toString() !== cid.toString())
  }

  next () {
    const queue = this.#queue
    let prevItem = queue.shift()
    if (!prevItem) return []
    const batch = [prevItem]
    while (true) {
      const item = queue.at(0)
      if (!item) break
      if (!isSameCar(item, prevItem) || item.offset + item.length - prevItem.offset >= MAX_BYTES_BETWEEN) {
        break
      }
      batch.push(item)
      queue.shift() // remove from the queue
      if (batch.length >= MAX_BATCH_SIZE) break
      prevItem = item
    }
    return batch
  }
}

/**
 * @param {ObjectID} a
 * @param {ObjectID} b
 */
function isSameCar (a, b) {
  return a.region === b.region && a.bucket === b.bucket && a.key === b.key
}
