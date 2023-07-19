import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identifyService } from 'libp2p/identify'
import { createLibp2p } from 'libp2p'
import { mplex } from '@libp2p/mplex'

/**
 * Dial a libp2p node
 *
 * Run the `wrangler dev` then curl the worker url to get the multiaddr.
 * Set secrets like PEER_ID_JSON in .dev.vars per the readme
 *
 * ```sh
 * curl https://hoverboard-staging.dag.haus
 * ⁂ hoverboard v0.0.0 /dns4/hoverboard-staging.dag.haus/tcp/443/wss/p2p/Qmc5vg9zuLYvDR1wtYHCaxjBHenfCNautRwCjG3n5v5fbs
 * ```
 *
 * Usage:
 * ```sh
 * $ node dial.js /dns4/hoverboard-staging.dag.haus/tcp/443/wss/p2p/Qmc5vg9zuLYvDR1wtYHCaxjBHenfCNautRwCjG3n5v5fbs
 * ```
 */

const peer = multiaddr(process.argv[2] ?? '/dns4/hoverboard-staging.dag.haus/tcp/443/wss/p2p/Qmc5vg9zuLYvDR1wtYHCaxjBHenfCNautRwCjG3n5v5fbs')
console.log(`Connecting to ${peer}`)

const dialer = await createLibp2p({
  connectionEncryption: [noise()],
  transports: [webSockets()],
  streamMuxers: [mplex()],
  services: {
    identify: identifyService()
  }
})

const conn = await dialer.dial(peer)
console.log('Connected to hoverboard 🛹', conn.remoteAddr.toString())
await dialer.hangUp(peer)
await dialer.stop()
