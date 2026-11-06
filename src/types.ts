import type {ComponentType} from 'react'

/** What a deployment builds: a Worker through Workers Builds, or a Pages project. */
export type DeployKind = 'workers' | 'pages'

/** One deployment as stored in the dataset (`_id` under `cloudflare-deploy.`). */
export interface CloudflareDeployment {
  _id: string
  _type: string
  name: string
  kind: DeployKind
  accountId: string
  /** Worker script name (Workers Builds). */
  workerName?: string
  /** Pages project name. */
  pagesProject?: string
  /** Branch to build. Empty means the production branch. */
  branch?: string
  accessToken?: string
  disableDeleteAction?: boolean
  /** Set when the deployment comes from the plugin config rather than the dataset. */
  predefined?: boolean
}

/** The values the create / edit form collects. */
export interface PendingDeployment {
  name: string
  kind: DeployKind
  accountId: string
  workerName: string
  pagesProject: string
  branch: string
  accessToken: string
  disableDeleteAction: boolean
}

/** A deployment declared in code, sharing the token saved in the tool settings. */
export type PredefinedDeployment = Pick<PendingDeployment, 'name' | 'kind' | 'accountId'> &
  Partial<Pick<PendingDeployment, 'workerName' | 'pagesProject' | 'branch'>>

export interface CloudflareDeployConfig {
  /** Tool route name. Default `cloudflare-deploy`. */
  name?: string
  /** Tool title in the Studio navbar. Default `Deploy`. */
  title?: string
  icon?: ComponentType
  /**
   * Where Cloudflare API requests go. The Cloudflare API sends no CORS headers,
   * so a browser cannot call `https://api.cloudflare.com` directly: point this
   * at a same-origin proxy (see `proxy.ts`). Default `/cloudflare-api/client/v4`.
   */
  apiBaseUrl?: string
  /** Deployments declared in code. Shown locked: no edit, no delete. */
  deployments?: PredefinedDeployment[]
}

/** Build state normalized across Workers Builds and Pages. */
export type BuildState = 'queued' | 'building' | 'success' | 'failed' | 'canceled' | 'unknown'

export interface Build {
  id: string
  state: BuildState
  createdAt: string
  finishedAt?: string
  branch?: string
  commitHash?: string
  commitMessage?: string
  author?: string
  source?: string
  /** Deployed or preview URL, when Cloudflare reports one. */
  url?: string
  dashboardUrl: string
}

/** A deployment resolved against the Cloudflare API, ready to build. */
export interface ResolvedTarget {
  /** Worker tag (`external_script_id`), Workers Builds only. */
  workerTag?: string
  triggerUuid?: string
  triggerName?: string
  /** Branch actually built, after falling back to the production branch. */
  branch: string
  repo?: string
  canCancel: boolean
}

export interface SecretsDocument {
  _id: string
  _type: string
  accessToken?: string
}
