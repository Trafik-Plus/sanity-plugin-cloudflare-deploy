import type {PendingDeployment} from './types'

export const API_VERSION = '2025-02-19'

export const DEFAULT_API_BASE_URL = '/cloudflare-api/client/v4'

export const DEPLOYMENT_TYPE = 'cloudflareDeploy.deployment'
/**
 * A dot in the `_id` keeps these documents out of public, unauthenticated reads:
 * only project members can query them. They still hold API tokens, so give the
 * tokens the narrowest permissions that work.
 */
export const DEPLOYMENT_ID_PREFIX = 'cloudflare-deploy.'
export const DEPLOYMENTS_QUERY = `*[_type == "${DEPLOYMENT_TYPE}" && _id in path("${DEPLOYMENT_ID_PREFIX}**")] | order(_createdAt asc)`

export const SECRETS_ID = 'secrets.cloudflareDeploy'
export const SECRETS_TYPE = 'cloudflareDeploy.secrets'

declare const process: {env: {NODE_ENV?: string}}
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/** Polling interval while a build is queued or running. */
export const POLL_INTERVAL_MS = 5000

export const EMPTY_PENDING: PendingDeployment = {
  name: '',
  kind: 'workers',
  accountId: '',
  workerName: '',
  pagesProject: '',
  branch: '',
  accessToken: '',
  disableDeleteAction: false,
}
