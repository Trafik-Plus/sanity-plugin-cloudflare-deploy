import {Badge, type BadgeTone} from '@sanity/ui'

import type {BuildState} from './types'

const TONES: Record<BuildState, BadgeTone> = {
  queued: 'default',
  building: 'caution',
  success: 'positive',
  failed: 'critical',
  canceled: 'default',
  unknown: 'default',
}

const LABELS: Record<BuildState, string> = {
  queued: 'Queued',
  building: 'Building',
  success: 'Ready',
  failed: 'Failed',
  canceled: 'Canceled',
  unknown: 'Unknown',
}

export function StatusBadge({state}: {state: BuildState | 'loading' | 'error' | 'none'}) {
  if (state === 'loading') return <Badge padding={2}>Loading</Badge>
  if (state === 'error') return <Badge tone="critical" padding={2}>Error</Badge>
  if (state === 'none') return <Badge padding={2}>No builds</Badge>
  return (
    <Badge tone={TONES[state]} padding={2}>
      {LABELS[state]}
    </Badge>
  )
}
