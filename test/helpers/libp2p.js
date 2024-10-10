import { multiaddr } from '@multiformats/multiaddr'
import { noise } from '@chainsafe/libp2p-noise'
import { webSockets } from '@libp2p/websockets'
import { identify } from '@libp2p/identify'
import * as Libp2p from 'libp2p'
import { yamux } from '@chainsafe/libp2p-yamux'
import { peerId } from '../fixture/peer.js'

export { peerId }

/**
 * @param {object} conf
 * @param {number} conf.port
 * @param {string} conf.host
 */
export function getListenAddr ({ port, host }) {
  return multiaddr(`/ip4/${host}/tcp/${port}/ws/p2p/${peerId.id}`)
}

export const createLibp2p = () =>
  Libp2p.createLibp2p({
    connectionEncrypters: [noise()],
    transports: [webSockets()],
    streamMuxers: [yamux()],
    services: {
      identify: identify()
    }
  })
