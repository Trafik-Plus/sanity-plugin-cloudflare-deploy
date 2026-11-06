/**
 * Thin Cloudflare API client for the two products this plugin deploys:
 * Workers Builds (a Worker connected to Git) and Pages. Both normalize to the
 * same `Build` / `ResolvedTarget` shapes so the UI does not branch on product.
 *
 * Docs:
 * - Workers Builds: https://developers.cloudflare.com/api/resources/workers_builds/
 * - Pages: https://developers.cloudflare.com/api/resources/pages/
 */
import type {Build, BuildState, CloudflareDeployment, ResolvedTarget} from './types'

export class CloudflareApiError extends Error {
  status: number
  code?: number

  constructor(message: string, status: number, code?: number) {
    super(message)
    this.name = 'CloudflareApiError'
    this.status = status
    this.code = code
  }
}

interface Envelope<T> {
  success: boolean
  errors?: Array<{code?: number; message?: string}>
  result: T
}

async function request<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!token) throw new CloudflareApiError('Missing Cloudflare API token', 0)

  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {Authorization: `Bearer ${token}`, ...init.headers},
    })
  } catch {
    throw new CloudflareApiError(
      `Could not reach ${baseUrl}. The Cloudflare API needs a same-origin proxy (see the plugin README).`,
      0,
    )
  }

  const text = await res.text()
  let body: Envelope<T>
  try {
    body = JSON.parse(text)
  } catch {
    throw new CloudflareApiError(
      `Unexpected non-JSON response (HTTP ${res.status}) from ${baseUrl}. Is the API proxy configured?`,
      res.status,
    )
  }

  if (!res.ok || body.success === false) {
    const first = body.errors?.[0]
    const hint =
      res.status === 403 || first?.code === 10000
        ? ' Check the token permissions (see the plugin README).'
        : ''
    throw new CloudflareApiError(`${first?.message || `HTTP ${res.status}`}${hint}`, res.status, first?.code)
  }

  return body.result
}

/* -------------------------------------------------------------------------- */
/* Workers Builds                                                             */
/* -------------------------------------------------------------------------- */

interface WorkersTrigger {
  trigger_uuid: string
  trigger_name?: string
  branch_includes?: string[]
  branch_excludes?: string[]
  repo_connection?: {repo_name?: string; provider_account_name?: string}
}

interface WorkersBuild {
  build_uuid: string
  status: string
  build_outcome?: string | null
  created_on: string
  stopped_on?: string | null
  preview_url?: string | null
  trigger?: {trigger_uuid?: string}
  build_trigger_metadata?: {
    branch?: string
    commit_hash?: string
    commit_message?: string
    author?: string
    build_trigger_source?: string
  }
}

/** Branch globs in triggers are simple: `*` matches anything, otherwise exact. */
const branchMatches = (patterns: string[] | undefined, branch: string) =>
  (patterns ?? []).some((pattern) =>
    pattern === '*' || pattern === branch
      ? true
      : pattern.includes('*') &&
        new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`).test(branch),
  )

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Pick the trigger that builds `branch`: an exact `branch_includes` match wins
 * over a wildcard one, so `main` resolves to the production trigger rather than
 * a "every branch" preview trigger.
 */
export function pickTrigger(triggers: WorkersTrigger[], branch: string) {
  const eligible = triggers.filter(
    (trigger) =>
      branchMatches(trigger.branch_includes, branch) &&
      !branchMatches(trigger.branch_excludes, branch),
  )
  return (
    eligible.find((trigger) => trigger.branch_includes?.includes(branch)) ?? eligible[0] ?? null
  )
}

const workerState = (build: WorkersBuild): BuildState => {
  switch (build.status) {
    case 'queued':
      return 'queued'
    case 'initializing':
    case 'running':
      return 'building'
    case 'stopped':
      switch (build.build_outcome) {
        case 'success':
          return 'success'
        case 'fail':
        case 'failure':
        case 'terminated':
          return 'failed'
        case 'cancelled':
        case 'canceled':
        case 'skipped':
          return 'canceled'
      }
  }
  return 'unknown'
}

async function resolveWorker(baseUrl: string, token: string, deployment: CloudflareDeployment) {
  const {accountId, workerName = ''} = deployment
  const service = await request<{default_environment?: {script?: {tag?: string}}}>(
    baseUrl,
    token,
    `/accounts/${accountId}/workers/services/${encodeURIComponent(workerName)}`,
  )
  const workerTag = service.default_environment?.script?.tag
  if (!workerTag) throw new CloudflareApiError(`Worker "${workerName}" not found`, 404)

  const triggers = await request<WorkersTrigger[]>(
    baseUrl,
    token,
    `/accounts/${accountId}/builds/workers/${workerTag}/triggers`,
  )
  if (!triggers.length) {
    throw new CloudflareApiError(
      `Worker "${workerName}" has no Git build trigger. Connect a repository under Settings → Builds.`,
      404,
    )
  }

  const branch = deployment.branch?.trim() || 'main'
  const trigger = pickTrigger(triggers, branch)
  if (!trigger) {
    throw new CloudflareApiError(`No build trigger of "${workerName}" builds branch "${branch}"`, 404)
  }

  return {
    workerTag,
    triggerUuid: trigger.trigger_uuid,
    triggerName: trigger.trigger_name,
    branch,
    repo: trigger.repo_connection?.repo_name,
    canCancel: true,
  } satisfies ResolvedTarget
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

interface PagesDeployment {
  id: string
  url?: string
  created_on: string
  modified_on?: string
  latest_stage?: {name?: string; status?: string; ended_on?: string | null}
  deployment_trigger?: {
    type?: string
    metadata?: {branch?: string; commit_hash?: string; commit_message?: string}
  }
}

const pagesState = (deployment: PagesDeployment): BuildState => {
  const {name, status} = deployment.latest_stage ?? {}
  if (status === 'failure') return 'failed'
  if (status === 'canceled') return 'canceled'
  if (status === 'success' && name === 'deploy') return 'success'
  if (name === 'queued' || status === 'idle') return 'queued'
  if (status === 'active' || status === 'success') return 'building'
  return 'unknown'
}

async function resolvePages(baseUrl: string, token: string, deployment: CloudflareDeployment) {
  const {accountId, pagesProject = ''} = deployment
  const project = await request<{
    production_branch?: string
    source?: {config?: {repo_name?: string}}
  }>(baseUrl, token, `/accounts/${accountId}/pages/projects/${encodeURIComponent(pagesProject)}`)

  return {
    branch: deployment.branch?.trim() || project.production_branch || 'main',
    repo: project.source?.config?.repo_name,
    canCancel: false,
  } satisfies ResolvedTarget
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export function resolveTarget(
  baseUrl: string,
  token: string,
  deployment: CloudflareDeployment,
): Promise<ResolvedTarget> {
  return deployment.kind === 'pages'
    ? resolvePages(baseUrl, token, deployment)
    : resolveWorker(baseUrl, token, deployment)
}

export async function startBuild(
  baseUrl: string,
  token: string,
  deployment: CloudflareDeployment,
  target: ResolvedTarget,
): Promise<void> {
  const {accountId} = deployment

  if (deployment.kind === 'pages') {
    const form = new FormData()
    form.set('branch', target.branch)
    await request(
      baseUrl,
      token,
      `/accounts/${accountId}/pages/projects/${encodeURIComponent(deployment.pagesProject ?? '')}/deployments`,
      {method: 'POST', body: form},
    )
    return
  }

  await request(baseUrl, token, `/accounts/${accountId}/builds/triggers/${target.triggerUuid}/builds`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({branch: target.branch}),
  })
}

export async function listBuilds(
  baseUrl: string,
  token: string,
  deployment: CloudflareDeployment,
  target: ResolvedTarget,
  limit = 10,
): Promise<Build[]> {
  const {accountId} = deployment

  if (deployment.kind === 'pages') {
    const project = encodeURIComponent(deployment.pagesProject ?? '')
    const deployments = await request<PagesDeployment[]>(
      baseUrl,
      token,
      `/accounts/${accountId}/pages/projects/${project}/deployments?per_page=25`,
    )
    return deployments
      .filter((item) => !target.branch || item.deployment_trigger?.metadata?.branch === target.branch)
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        state: pagesState(item),
        createdAt: item.created_on,
        finishedAt: item.latest_stage?.ended_on ?? undefined,
        branch: item.deployment_trigger?.metadata?.branch,
        commitHash: item.deployment_trigger?.metadata?.commit_hash,
        commitMessage: item.deployment_trigger?.metadata?.commit_message,
        source: item.deployment_trigger?.type,
        url: item.url,
        dashboardUrl: `https://dash.cloudflare.com/${accountId}/pages/view/${project}/${item.id}`,
      }))
  }

  const builds = await request<WorkersBuild[]>(
    baseUrl,
    token,
    `/accounts/${accountId}/builds/workers/${target.workerTag}/builds?per_page=25`,
  )
  const worker = encodeURIComponent(deployment.workerName ?? '')
  return builds
    .filter((build) => !build.trigger?.trigger_uuid || build.trigger.trigger_uuid === target.triggerUuid)
    .slice(0, limit)
    .map((build) => ({
      id: build.build_uuid,
      state: workerState(build),
      createdAt: build.created_on,
      finishedAt: build.stopped_on ?? undefined,
      branch: build.build_trigger_metadata?.branch,
      commitHash: build.build_trigger_metadata?.commit_hash,
      commitMessage: build.build_trigger_metadata?.commit_message,
      author: build.build_trigger_metadata?.author,
      source: build.build_trigger_metadata?.build_trigger_source,
      url: build.preview_url ?? undefined,
      dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${worker}/production/builds/${build.build_uuid}`,
    }))
}

export async function cancelBuild(
  baseUrl: string,
  token: string,
  deployment: CloudflareDeployment,
  build: Build,
): Promise<void> {
  if (deployment.kind === 'pages') {
    throw new CloudflareApiError('Cloudflare Pages has no API to cancel a deployment', 400)
  }
  await request(baseUrl, token, `/accounts/${deployment.accountId}/builds/builds/${build.id}/cancel`, {
    method: 'PUT',
  })
}

export const isActive = (state: BuildState) => state === 'queued' || state === 'building'
