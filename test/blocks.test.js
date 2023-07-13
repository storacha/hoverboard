import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { mockClient } from 'aws-sdk-client-mock'
import { CID } from 'multiformats/cid'
import { toCarKey, DynamoBlockFinder, DagHausBlockStore } from '../src/blocks.js'
import test from 'ava'

test('upgradeCarPath', t => {
  const rawCarPath = 'us-east-2/dotstorage-staging-0/raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car'
  const carKey = 'bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq/bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq.car'
  t.is(toCarKey(rawCarPath), carKey, 'raw carPath is converted to carKey')

  const completeCarPath = 'us-east-2/dotstorage-staging-0/complete/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za.car'
  t.is(toCarKey(completeCarPath), undefined, 'complete carPath is not converted (yet)')

  const carKeyPath = `region/bucket/${carKey}`
  t.is(toCarKey(carKeyPath), carKey, 'passing a carKeyPath just strips the region and bucket')
})

test('DynamoBlockFinder', async t => {
  const client = mockClient(DynamoDBDocumentClient)
  /** @type {import('../src/blocks.js').BlockLocation} */
  const record = {
    blockmultihash: 'zQmXWxE2sdWFeLHfVEp6bb6kib9YWWEvsaAJSgoExKrPVXD',
    carpath: 'us-east-2/dotstorage-staging-0/raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car',
    length: 58,
    offset: 96
  }
  client.on(GetCommand).resolves({
    Item: record
  })

  const dynamo = new DynamoBlockFinder('test', client)
  const cid = CID.parse(record.blockmultihash.slice(1))
  const loc = await dynamo.find(cid)
  t.not(loc, undefined)
  t.like(record, loc)
})

test('DagHausBlockStore', async t => {
  const client = mockClient(DynamoDBDocumentClient)
  /** @type {import('../src/blocks.js').BlockLocation} */
  const record = {
    blockmultihash: 'zQmXWxE2sdWFeLHfVEp6bb6kib9YWWEvsaAJSgoExKrPVXD',
    carpath: 'us-east-2/dotstorage-staging-0/raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car',
    length: 58,
    offset: 96
  }
  client.on(GetCommand).resolves({
    Item: record
  })
  const dynamo = new DynamoBlockFinder('test', client)
  const carpark = {
    async get () {
      return {
        async arrayBuffer () {
          return new Uint8Array(Array.from({ length: record.length }, (x, i) => i)).buffer
        }
      }
    }
  }
  const bs = new DagHausBlockStore(dynamo, carpark)
  const cid = CID.parse(record.blockmultihash.slice(1))
  const bytes = await bs.get(cid)
  t.is(bytes.length, record.length)
})
