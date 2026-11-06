import assert from 'node:assert/strict'
import {test} from 'node:test'

import {pickTrigger} from '../src/api.ts'
import {isAllowedCloudflareRequest} from '../src/proxy.ts'

const production = {trigger_uuid: 'prod', branch_includes: ['main'], branch_excludes: []}
const previews = {trigger_uuid: 'preview', branch_includes: ['*'], branch_excludes: ['main']}

test('pickTrigger prefers an exact branch match', () => {
  assert.equal(pickTrigger([previews, production], 'main')?.trigger_uuid, 'prod')
})

test('pickTrigger falls back to a wildcard trigger', () => {
  assert.equal(pickTrigger([production, previews], 'staging')?.trigger_uuid, 'preview')
})

test('pickTrigger honours excludes and globs', () => {
  const release = {trigger_uuid: 'release', branch_includes: ['release/*'], branch_excludes: []}
  assert.equal(pickTrigger([production, release], 'release/1.2')?.trigger_uuid, 'release')
  assert.equal(pickTrigger([production], 'feature'), null)
})

test('proxy allows only the endpoints the plugin calls', () => {
  const a = '/client/v4/accounts/abc123'
  assert.ok(isAllowedCloudflareRequest('GET', `${a}/workers/services/my-worker`))
  assert.ok(isAllowedCloudflareRequest('GET', `${a}/builds/workers/tag1/builds`))
  assert.ok(isAllowedCloudflareRequest('POST', `${a}/builds/triggers/uuid-1/builds`))
  assert.ok(isAllowedCloudflareRequest('PUT', `${a}/builds/builds/uuid-1/cancel`))
  assert.ok(isAllowedCloudflareRequest('POST', `${a}/pages/projects/site/deployments`))
  assert.ok(!isAllowedCloudflareRequest('DELETE', `${a}/workers/scripts/my-worker`))
  assert.ok(!isAllowedCloudflareRequest('GET', `${a}/workers/services/x/../../tokens`))
  assert.ok(!isAllowedCloudflareRequest('GET', '/client/v4/user/tokens'))
})
