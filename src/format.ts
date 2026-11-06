const relative = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'})
const absolute = new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'})

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** "3 minutes ago" */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return relative.format(Math.round(seconds / size), unit)
    }
  }
  return ''
}

/** "1m 24s" */
export function duration(fromIso: string, toIso?: string, now = Date.now()): string {
  const end = toIso ? new Date(toIso).getTime() : now
  const total = Math.max(0, Math.round((end - new Date(fromIso).getTime()) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`
}

export const formatDate = (iso: string) => absolute.format(new Date(iso))
