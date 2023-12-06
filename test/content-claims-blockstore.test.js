import test from 'ava'
import { createSimpleContentClaimsScenario, listen, mockClaimsService } from './lib/content-claims-nodejs.js'
import { ContentClaimsBlockstore } from '../src/content-claims-blockstore.js'
import * as Claims from '@web3-storage/content-claims/client'

test('ContentClaimsBlockstore can get block from location claim data URL', async t => {
  const testInput = `test-${Math.random().toString().slice(2)}`
  const { claims, inputCID } = await createSimpleContentClaimsScenario(testInput)
  const claimsServer = await listen(mockClaimsService(claims))
  try {
    await useClaimsServer(claimsServer)
  } finally {
    await claimsServer.stop()
  }
  /**
   * @param {{ url: URL }} options
   */
  async function useClaimsServer ({ url }) {
    const blocks = new ContentClaimsBlockstore({ url, read: Claims.read })
    t.assert(await blocks.has(inputCID), '.has(inputCID)')
    const block = await blocks.get(inputCID)
    t.assert(block, 'got block')
    const decodedBlock = (new TextDecoder()).decode(block)
    t.is(decodedBlock, testInput)
  }
})
