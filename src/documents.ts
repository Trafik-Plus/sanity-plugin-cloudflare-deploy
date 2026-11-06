import type {SanityClient} from 'sanity'

import {DEPLOYMENT_ID_PREFIX, DEPLOYMENT_TYPE, SECRETS_ID, SECRETS_TYPE} from './constants'
import type {CloudflareDeployment, PendingDeployment} from './types'

/** The stored fields for a form submission, trimmed, with the unused name dropped. */
export function toFields(pending: PendingDeployment) {
  const isWorkers = pending.kind === 'workers'
  return {
    name: pending.name.trim(),
    kind: pending.kind,
    accountId: pending.accountId.trim(),
    workerName: isWorkers ? pending.workerName.trim() : undefined,
    pagesProject: isWorkers ? undefined : pending.pagesProject.trim(),
    branch: pending.branch.trim() || undefined,
    disableDeleteAction: pending.disableDeleteAction,
  }
}

export function toDeployment(pending: PendingDeployment, _id = 'pending'): CloudflareDeployment {
  return {_id, _type: DEPLOYMENT_TYPE, ...toFields(pending), accessToken: pending.accessToken.trim()}
}

export function toPending(deployment: CloudflareDeployment): PendingDeployment {
  return {
    name: deployment.name,
    kind: deployment.kind,
    accountId: deployment.accountId,
    workerName: deployment.workerName ?? '',
    pagesProject: deployment.pagesProject ?? '',
    branch: deployment.branch ?? '',
    accessToken: '',
    disableDeleteAction: Boolean(deployment.disableDeleteAction),
  }
}

export function createDeployment(client: SanityClient, pending: PendingDeployment) {
  return client.create({
    _id: `${DEPLOYMENT_ID_PREFIX}${crypto.randomUUID()}`,
    _type: DEPLOYMENT_TYPE,
    ...toFields(pending),
    accessToken: pending.accessToken.trim(),
  })
}

export function updateDeployment(client: SanityClient, id: string, pending: PendingDeployment) {
  const fields = toFields(pending)
  const token = pending.accessToken.trim()
  const unset = (Object.keys(fields) as Array<keyof typeof fields>).filter(
    (key) => fields[key] === undefined,
  )
  return client
    .patch(id)
    .set({...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)), ...(token ? {accessToken: token} : {})})
    .unset(unset)
    .commit()
}

export function saveSharedToken(client: SanityClient, accessToken: string) {
  return client.createOrReplace({_id: SECRETS_ID, _type: SECRETS_TYPE, accessToken: accessToken.trim()})
}
