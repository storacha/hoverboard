import anyTest from 'ava'
import { peerId } from './fixture/peer.js'
import * as TestContext from './helpers/context.js'

const test = /** @type {import('ava').TestFn<import('./helpers/context.js').TestContext>} */ (anyTest)

test.beforeEach(async (t) => {
  t.context = await TestContext.create()
})

test.afterEach(async t => {
  await TestContext.destroy(t.context)
})

test('get /', async t => {
  const { worker } = t.context
  const resp = await worker.dispatchFetch('http://localhost:8787')
  const text = await resp.text()
  t.regex(text, new RegExp(peerId.id))
})

test('libp2p identify', async t => {
  const { libp2p, multiaddr } = t.context
  const peer = await libp2p.dial(multiaddr)
  t.is(peer.remoteAddr.getPeerId(), peerId.id)
  await t.notThrowsAsync(() => libp2p.services.identify.identify(peer))
})
