import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identifyService } from 'libp2p/identify'
import { createLibp2p } from 'libp2p'
import { mplex } from '@libp2p/mplex'

/**
 * Run the `wranger dev` then run this to connect to the worker via libp2p
 *
 * ```sh
 * $ node dial.js [worker url]
 * ```
 */

const { hostname, port } = new URL(process.argv[2] ?? 'http://127.0.0.1:8787/')
const PEER_ID = 'Qmcv3CsJAN8ptXR8vm5a5GRrzkHGjaEUF9cQRGzYptMwzp'
const PEER_ADDR = multiaddr(`/ip4/${hostname}/tcp/${port}/ws/p2p/${PEER_ID}`)

const dialer = await createLibp2p({
  connectionEncryption: [noise()],
  transports: [webSockets()],
  streamMuxers: [mplex()],
  services: {
    identify: identifyService()
  }
})

// dialer.addEventListener('peer:identify', console.log)
const peer = await dialer.dial(PEER_ADDR)
console.log('Connected to hoverboard 🛹', peer.remoteAddr.toString())
await dialer.hangUp(PEER_ADDR)
await dialer.stop()
