/* eslint-env worker */
import anyTest from 'ava'
import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import * as ed25519 from '@ucanto/principal/ed25519'
import { CID } from 'multiformats/cid'
import { peerId } from './fixture/peer.js'
import { generateClaims } from './helpers/content-claims.js'
import * as TestContext from './helpers/context.js'

const test = /** @type {import('ava').TestFn<import('./helpers/context.js').TestContext>} */ (anyTest)

test.beforeEach(async (t) => {
  t.context = await TestContext.create()
})

test.afterEach(async t => {
  await TestContext.destroy(t.context)
})

/**
 * - create dag, pack to car, add indexes to dynamo and blocks to s3
 * - start hoverboard worker
 * - start local libp2p node, connect to hoverboard
 * - wrap libp2p in helia, fetch rood cid of dag from helia
 * - assert blocks are in helia, and data round trips
 */
test('helia bitswap', async t => {
  t.timeout(60_000)

  const { builder, indexingService, libp2p, multiaddr } = t.context

  const expected = 'hoverboard 🛹'
  const blob = new Blob([new TextEncoder().encode(expected)])
  const { root, shards, index } = await builder.add(blob)

  const signer = await ed25519.generate()
  const claims = await generateClaims(signer, { root, shards, index })
  for (const c of claims) {
    indexingService.claimStore.put(c)
  }

  console.log('Creating local helia')
  const helia = await createHelia({ libp2p })
  const heliaFs = unixfs(helia)

  console.log(`Dialing ${multiaddr}`)
  const peer = await libp2p.dial(multiaddr)
  t.is(peer.remoteAddr.getPeerId(), peerId.id)

  const decoder = new TextDecoder('utf8')
  let text = ''

  console.log(`Fetching ${root}`)

  const rootCID = CID.parse(root.toString())
  for await (const chunk of heliaFs.cat(rootCID)) {
    text += decoder.decode(chunk, { stream: true })
  }
  text += decoder.decode()

  t.true(await helia.blockstore.has(rootCID), 'block should now be in helia blockstore')
  t.is(text, expected, 'bitswap roundtrippin')
})
