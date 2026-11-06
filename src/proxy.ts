/**
 * The Cloudflare API sends no CORS headers, so Sanity Studio (a browser app)
 * cannot call `https://api.cloudflare.com` directly. These helpers forward the
 * plugin's requests from a same-origin path to the API.
 *
 * - `cloudflareApiViteProxy()` for `sanity dev` (add it to `sanity.cli.ts`).
 * - `handleCloudflareApiProxy()` for a hosted Studio running on a Worker.
 *
 * The proxy holds no credentials: the API token travels with each request from
 * the Studio. It forwards only the endpoints the plugin uses.
 */

export const DEFAULT_PROXY_PREFIX = '/cloudflare-api'
const UPSTREAM = 'https://api.cloudflare.com'

/** The endpoints the plugin calls, after the `/client/v4` prefix. */
const ALLOWED: Array<[method: string, pattern: RegExp]> = [
  ['GET', /^\/accounts\/[\w-]+\/workers\/services\/[^/]+$/],
  ['GET', /^\/accounts\/[\w-]+\/builds\/workers\/[\w-]+\/(triggers|builds)$/],
  ['POST', /^\/accounts\/[\w-]+\/builds\/triggers\/[\w-]+\/builds$/],
  ['PUT', /^\/accounts\/[\w-]+\/builds\/builds\/[\w-]+\/cancel$/],
  ['GET', /^\/accounts\/[\w-]+\/pages\/projects\/[^/]+$/],
  ['GET', /^\/accounts\/[\w-]+\/pages\/projects\/[^/]+\/deployments$/],
  ['POST', /^\/accounts\/[\w-]+\/pages\/projects\/[^/]+\/deployments$/],
]

/** True when `method` + `path` (starting at `/client/v4`) is one the plugin uses. */
export function isAllowedCloudflareRequest(method: string, path: string): boolean {
  if (!path.startsWith('/client/v4/')) return false
  const rest = path.slice('/client/v4'.length)
  return ALLOWED.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(rest))
}

export interface ProxyOptions {
  /** Path the plugin calls. Must match the plugin's `apiBaseUrl` minus `/client/v4`. */
  prefix?: string
}

/**
 * Worker `fetch` handler. Returns a `Response` for requests under `prefix`,
 * or `null` so the caller can serve the Studio's static assets instead.
 *
 * ```ts
 * import {handleCloudflareApiProxy} from '@trafik-plus/sanity-plugin-cloudflare-deploy/proxy'
 *
 * export default {
 *   async fetch(request, env) {
 *     return (await handleCloudflareApiProxy(request)) ?? env.ASSETS.fetch(request)
 *   },
 * }
 * ```
 */
export async function handleCloudflareApiProxy(
  request: Request,
  {prefix = DEFAULT_PROXY_PREFIX}: ProxyOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null

  const path = url.pathname.slice(prefix.length)
  if (!isAllowedCloudflareRequest(request.method, path)) {
    return Response.json(
      {success: false, errors: [{code: 403, message: 'Endpoint not allowed by the proxy'}], result: null},
      {status: 403},
    )
  }

  const headers = new Headers()
  for (const name of ['authorization', 'content-type', 'accept']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  const upstream = await fetch(`${UPSTREAM}${path}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Vite `server.proxy` entry for `sanity dev`.
 *
 * ```ts
 * // sanity.cli.ts
 * import {cloudflareApiViteProxy} from '@trafik-plus/sanity-plugin-cloudflare-deploy/proxy'
 *
 * export default defineCliConfig({
 *   vite: (config) => ({
 *     ...config,
 *     server: {...config.server, proxy: {...config.server?.proxy, ...cloudflareApiViteProxy()}},
 *   }),
 * })
 * ```
 */
export function cloudflareApiViteProxy({prefix = DEFAULT_PROXY_PREFIX}: ProxyOptions = {}) {
  return {
    [prefix]: {
      target: UPSTREAM,
      changeOrigin: true,
      rewrite: (path: string) => path.slice(prefix.length),
      // Drop browser headers the API does not need; keep the token and body type.
      configure: (proxy: {on: (event: 'proxyReq', handler: (req: ProxyRequest) => void) => void}) => {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('origin')
          proxyReq.removeHeader('referer')
          proxyReq.removeHeader('cookie')
        })
      },
    },
  }
}

interface ProxyRequest {
  removeHeader: (name: string) => void
}
