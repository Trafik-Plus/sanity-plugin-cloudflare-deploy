import {useCallback, useEffect, useRef, useState} from 'react'
import {useClient as useSanityClient, type SanityClient} from 'sanity'

import {isActive, listBuilds, resolveTarget} from './api'
import {API_VERSION, POLL_INTERVAL_MS} from './constants'
import type {Build, CloudflareDeployment, ResolvedTarget} from './types'

export const useClient = (): SanityClient => useSanityClient({apiVersion: API_VERSION})

/** Documents matching `query`, kept current with a listener. */
export function useLiveDocuments<T extends {_id: string}>(query: string) {
  const client = useClient()
  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    const refetch = () =>
      client
        .fetch<T[]>(query)
        .then((docs) => !cancelled && setData(docs))
        .catch((err: Error) => !cancelled && setError(err))
        .finally(() => !cancelled && setIsLoading(false))

    refetch()
    // Refetch rather than patch the list by hand: mutations arrive one document
    // at a time and the query owns the ordering.
    const subscription = client
      .listen(query, {}, {includeResult: false, visibility: 'query'})
      .subscribe({next: (event) => event.type === 'mutation' && refetch()})

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [client, query])

  return {data, isLoading, error}
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Resolve a deployment against the Cloudflare API (Worker tag, build trigger,
 * branch), then load its builds. Polls while the latest build is running.
 */
export function useDeploymentBuilds(
  baseUrl: string,
  deployment: CloudflareDeployment,
  token: string | undefined,
) {
  const [target, setTarget] = useState<ResolvedTarget | null>(null)
  const [builds, setBuilds] = useState<Build[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  /** Set after a deploy is triggered so polling starts before the build shows up. */
  const [expectingBuild, setExpectingBuild] = useState(false)
  const requestId = useRef(0)

  const {kind, accountId, workerName, pagesProject, branch} = deployment

  useEffect(() => {
    let cancelled = false
    setTarget(null)
    setBuilds([])
    setError(null)
    setIsLoading(true)

    if (!token) {
      setError('No Cloudflare API token')
      setIsLoading(false)
      return
    }

    resolveTarget(baseUrl, token, {...deployment})
      .then((resolved) => !cancelled && setTarget(resolved))
      .catch((err) => {
        if (cancelled) return
        setError(messageOf(err))
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Resolve again only when what identifies the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, token, kind, accountId, workerName, pagesProject, branch])

  const refresh = useCallback(async () => {
    if (!target || !token) return
    const id = ++requestId.current
    try {
      const next = await listBuilds(baseUrl, token, deployment, target)
      if (id !== requestId.current) return
      setBuilds(next)
      setError(null)
    } catch (err) {
      if (id !== requestId.current) return
      setError(messageOf(err))
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, token, target, kind, accountId, workerName, pagesProject])

  useEffect(() => {
    refresh()
  }, [refresh])

  const latest = builds[0]
  const latestIsActive = latest ? isActive(latest.state) : false

  // Stop expecting once a new active build appears (or after two minutes).
  useEffect(() => {
    if (!expectingBuild) return
    if (latestIsActive) {
      setExpectingBuild(false)
      return
    }
    const timeout = setTimeout(() => setExpectingBuild(false), 120_000)
    return () => clearTimeout(timeout)
  }, [expectingBuild, latestIsActive])

  const shouldPoll = latestIsActive || expectingBuild
  useEffect(() => {
    if (!shouldPoll) return
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [shouldPoll, refresh])

  return {
    target,
    builds,
    latest,
    error,
    isLoading,
    isPolling: shouldPoll,
    refresh,
    expectBuild: () => setExpectingBuild(true),
  }
}

/** Re-render every `ms` while `enabled`, for ticking relative times. */
export function useNow(enabled: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(interval)
  }, [enabled, ms])
  return now
}
