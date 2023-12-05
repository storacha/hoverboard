import { Map as LinkMap } from 'lnmap'
import * as Link from 'multiformats/link'
import { CARWriterStream } from 'carstream/writer'
import { Writable } from 'node:stream'
import { CARReaderStream } from 'carstream'
import * as raw from 'multiformats/codecs/raw'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import { identity } from 'multiformats/hashes/identity'
import { blake2b256 } from '@multiformats/blake2/blake2b'
import * as pb from '@ipld/dag-pb'
import * as cbor from '@ipld/dag-cbor'
import * as json from '@ipld/dag-json'
import { Assert } from '@web3-storage/content-claims/capability'
import { Signer as Ed25519Signer } from '@ucanto/principal/ed25519'

/* global WritableStream */
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

const Decoders = {
  [raw.code]: raw,
  [pb.code]: pb,
  [cbor.code]: cbor,
  [json.code]: json
}

const Hashers = {
  [identity.code]: identity,
  [sha256.code]: sha256,
  [blake2b256.code]: blake2b256
}

/**
 * @param {import('@ucanto/interface').Signer} signer
 * @param {import('multiformats').UnknownLink} dataCid
 * @param {import('cardex/api').CARLink} carCid
 * @param {ReadableStream<Uint8Array>} carStream CAR file data
 * @param {import('multiformats').Link} indexCid
 * @param {import('cardex/api').CARLink} indexCarCid
 */
export const generateClaims = async (signer, dataCid, carCid, carStream, indexCid, indexCarCid) => {
  /** @type {Claims} */
  const claims = new LinkMap()

  // partition claim for the data CID
  claims.set(dataCid, [
    await encodeInvocationBlock(Assert.partition.invoke({
      issuer: signer,
      audience: signer,
      with: signer.did(),
      nb: {
        content: dataCid,
        parts: [carCid]
      }
    }))
  ])

  /** @type {Map<import('multiformats').UnknownLink, RelationIndexData>} */
  const indexData = new LinkMap()

  await carStream
    .pipeThrough(new CARReaderStream())
    .pipeTo(new WritableStream({
      async write ({ cid, bytes }) {
        // @ts-expect-error cid.code may not be in Decoders
        const decoder = Decoders[cid.code]
        if (!decoder) throw Object.assign(new Error(`missing decoder: ${cid.code}`), { code: 'ERR_MISSING_DECODER' })

        // @ts-expect-error cid.multihash.code may not be in Hashers
        const hasher = Hashers[cid.multihash.code]
        if (!hasher) throw Object.assign(new Error(`missing hasher: ${cid.multihash.code}`), { code: 'ERR_MISSING_HASHER' })

        const block = await Block.decode({ bytes, codec: decoder, hasher })
        indexData.set(cid, { cid, bytes, children: [...block.links()].map(([, cid]) => cid) })
      }
    }))

  for (const [cid, { children }] of indexData) {
    const invocation = Assert.relation.invoke({
      issuer: signer,
      audience: signer,
      with: signer.did(),
      nb: {
        content: cid,
        children,
        parts: [{
          content: carCid,
          includes: {
            content: indexCid,
            parts: [indexCarCid]
          }
        }]
      }
    })

    const blocks = claims.get(cid) ?? []
    blocks.push(await encodeInvocationBlock(invocation))
    claims.set(cid, blocks)
  }

  // partition claim for the index
  claims.set(indexCid, [
    await encodeInvocationBlock(Assert.partition.invoke({
      issuer: signer,
      audience: signer,
      with: signer.did(),
      nb: {
        content: indexCid,
        parts: [indexCarCid]
      }
    }))
  ])

  return claims
}

/**
 * multicodec code indicating content is a CAR file
 * @see https://github.com/multiformats/multicodec/blob/master/table.csv#L140
 */
export const CAR_MULTICODEC_CODE = 0x0202

/**
 * Encode a claim to a block.
 * @param {import('@ucanto/interface').IssuedInvocationView} invocation
 */
export async function encodeInvocationBlock (invocation) {
  const view = await invocation.buildIPLDView()
  const bytes = await view.archive()
  if (bytes.error) throw new Error('failed to archive')
  return { cid: Link.create(CAR_MULTICODEC_CODE, await sha256.digest(bytes.ok)), bytes: bytes.ok }
}
/**
 * @param {string} input - text input to use as the sample content that will be encoded into a car file
 * @param {object} options
 * @param {import('@ucanto/interface').Signer} [options.signer]
 */
export async function createSimpleContentClaimsScenario (input, options = {}) {
  const {
    signer = await Ed25519Signer.generate()
  } = options

  const inputBuffer = (new TextEncoder()).encode(input)
  const inputBlock = await Block.encode({ value: inputBuffer, codec: raw, hasher: sha256 })
  const inputCID = await inputBlock.cid
  const createInputBlockStream = () => {
    /** @type {ReadableStream<import('carstream/api').Block>} */
    const blocks = new ReadableStream({
      start (controller) {
        /** @type {import('carstream/api').Block} */
        const block = {
          cid: inputBlock.cid,
          bytes: inputBlock.bytes
        }
        controller.enqueue(block)
        controller.close()
      }
    })
    return blocks
  }
  const createCarBlob = () => new Response(createInputBlockStream().pipeThrough(new CARWriterStream([inputBlock.cid]))).blob()

  const car = await createCarBlob()

  const carBytes = new Uint8Array(await car.arrayBuffer())
  const carDataUri = /** @type {`data:${string}`} */(`data:application/vnd.ipld.car;base64,${btoa(String.fromCharCode.apply(null, Array.from(carBytes)))}`)
  /** @type {import('cardex/api.js').CARLink} */
  const carLink = Link.create(CAR_MULTICODEC_CODE, await sha256.digest(new Uint8Array(await car.arrayBuffer())))

  // make a mock location claim
  // that cid for input can be found at a url
  const claims = await Promise.resolve(new LinkMap()).then(async claims => {
    const locationClaim = Assert.location.invoke({
      issuer: signer,
      audience: signer,
      with: signer.did(),
      nb: {
        content: inputCID,
        location: [carDataUri]
      }
    })

    claims.set(inputCID, [
      await encodeInvocationBlock(locationClaim)
    ])
    // @todo build other kinds of claims e.g. assert/relation
    // e.g. in the wild '[{"content":{"/":"bafybeidtvuezudgvdciehupi2nlduu5t2r6nkb7o3brwqhdrig6jfc2gd4"},"location":["https://dotstorage-prod-1.s3.amazonaws.com/raw/bafybeidtvuezudgvdciehupi2nlduu5t2r6nkb7o3brwqhdrig6jfc2gd4/308707845265687115/ciqcoeewnamafntujapktkuekgfroq7tgapvehgxrg5mzyn4tdbh75y.car"],"type":"assert/location"},{"parts":[{"content":{"/":"bagbaierae4ijm2ayak3hisa6vgviiumlc5b7gma7kionpcn2ztq3zggcp73q"},"includes":{"content":{"/":"bagaqqeraqqipfw4sjfwsu5s3eykpcof2omov2v6vdg6gn7765wqo4sdjr7bq"}}}],"content":{"/":"bafybeidtvuezudgvdciehupi2nlduu5t2r6nkb7o3brwqhdrig6jfc2gd4"},"children":[],"type":"assert/relation"}]'
    return claims
  })

  return {
    inputCID,
    inputBlock,
    car,
    carLink,
    claims,
    signer
  }
}
