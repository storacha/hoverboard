import { Map as LinkMap } from 'lnmap'
import * as Link from 'multiformats/link'
import { CARWriterStream } from 'carstream/writer'
import { Writable } from 'stream'

/* global ReadableStream */

/**
 * @typedef {import('carstream/api').Block & { children: import('multiformats').UnknownLink[] }} RelationIndexData
 * @typedef {Map<import('multiformats').UnknownLink, import('carstream/api').Block[]>} Claims
 * @typedef {{ setClaims: (c: Claims) => void, close: () => void, port: number, signer: import('@ucanto/interface').Signer }} MockClaimsService
 * @typedef {import('@web3-storage/content-claims/server/api').ClaimStore} ClaimStore
 */

/**
 * @param {Claims} claims
 * @returns
 */
export const mockClaimsService = async (
  claims = new LinkMap()
) => {
  /** @param {Claims} s */
  const setClaims = s => { claims = s }
  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').OutgoingMessage} res
   */
  const listener = async (req, res) => {
    const content = Link.parse(String(req.url?.split('/')[2]))
    const blocks = claims.get(content) ?? []
    const readable = new ReadableStream({
      pull (controller) {
        const block = blocks.shift()
        if (!block) return controller.close()
        controller.enqueue(block)
      }
    })
    await readable
      .pipeThrough(new CARWriterStream())
      .pipeTo(Writable.toWeb(res))
  }
  return { claims, setClaims, listener }
}
