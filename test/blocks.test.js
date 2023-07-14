import { toCarKey } from '../src/blocks.js'
import test from 'ava'

test('upgradeCarPath', t => {
  const rawCarPath = 'raw/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za/315318734258473269/ciqjxmllx5y73brw6mv3pkvd7sotfk2turkupkq7tsgygrdy2yxibri.car'
  const carKey = 'bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq/bagbaieratoywxp3r7wddn4zlw6vkh7e5gkvvhjcvi6vb7henqnchrvroqdcq.car'
  t.is(toCarKey(rawCarPath), carKey, 'raw carPath is converted to carKey')

  const completeCarPath = 'complete/bafybeieiltf3tnfdyvdutyolzhfahphgevnjsso26nulfqxtkptyefq3za.car'
  t.is(toCarKey(completeCarPath), undefined, 'complete carPath is not converted (yet)')

  t.is(toCarKey(carKey), carKey, 'passing a carKey is a no-op')
})
