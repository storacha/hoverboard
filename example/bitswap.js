import { multiaddr } from '@multiformats/multiaddr'
import * as Dagula from 'dagula/p2p.js'

/**
 * Fetch cids via bitswap
 *
 * NOTE:
 * - Run the `wrangler dev` then curl the worker url to get the multiaddr.
 * - Set secrets like PEER_ID_JSON in .dev.vars per the readme
 * - You can only fetch CIDs that are available in the env (staging||production) that you are connecting to

 * Usage:
 * ```sh
 * $ curl https://hoverboard-staging.dag.haus
 * ⁂ hoverboard v0.0.0 /dns4/hoverboard-staging.dag.haus/tcp/443/wss/p2p/Qmc5vg9zuLYvDR1wtYHCaxjBHenfCNautRwCjG3n5v5fbs
 *
 * $ node bitswap.js [multiaddr] [cid1...]
 * Connecting to /dns4/hoverboard-staging.dag.haus/tcp/443/wss/p2p/Qmc5vg9zuLYvDR1wtYHCaxjBHenfCNautRwCjG3n5v5fbs
 * Fetching bafybeicm3skx7ps2bwkh56l3mirh3hu4hmkfttfwjkmk4cr25sxtf2jmby
 * ```
 */

const peer = multiaddr(process.argv[2] ?? '/dns4/hoverboard-staging.dag.haus/tcp/443/wss/p2p/Qmc5vg9zuLYvDR1wtYHCaxjBHenfCNautRwCjG3n5v5fbs')
console.log(`Connecting to ${peer}`)

const libp2p = await Dagula.getLibp2p()
const dagula = await Dagula.fromNetwork(libp2p, { peer })

let cids = process.argv.slice(3)
if (cids.length === 0) {
  // ISS 4K Crew Earth Observations~orig.mov 328MiB
  cids = ['bafybeicm3skx7ps2bwkh56l3mirh3hu4hmkfttfwjkmk4cr25sxtf2jmby']
}
console.log(`Fetching ${cids[0]}`)

let count = 0
let byteCount = 0
for (const cid of cids) {
  let blocksInDag = 0
  for await (const block of dagula.get(cid)) {
    const i = `${++count}`.padStart(4, '0')
    byteCount += block.bytes.length
    console.log(`${i} ${cid} -> ${block.cid} (${block.bytes.length} bytes, ${++blocksInDag} blocks in dag)`)
  }
}
console.log('bytes received', byteCount)
console.log('blocks received', count)
console.log('Stopping libp2p')
await libp2p.stop()

console.log('done')
