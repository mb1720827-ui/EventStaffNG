// Path the app is served from ("/" locally, "/EventStaffNG/" on GitHub Pages).
export const BASE = import.meta.env.BASE_URL
export const appUrl = (path = '') => `${BASE}${String(path).replace(/^\//, '')}`
export const absoluteUrl = (path) => new URL(appUrl(path), window.location.origin).href

export const money = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`

export function formatDate(value, options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '—'
  // Plain YYYY-MM-DD strings are parsed as local dates so they don't shift a day.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-NG', options)
}

export const shortDate = (value) => formatDate(value, { day: 'numeric', month: 'short' })

export function formatTime(value) {
  if (!value) return ''
  const [h, m] = String(value).split(':').map(Number)
  if (Number.isNaN(h)) return value
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`
}

export const timeRange = (start, end) => [formatTime(start), formatTime(end)].filter(Boolean).join(' – ')

export function hoursBetween(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const minutes = eh * 60 + em - (sh * 60 + sm)
  return Math.round(((minutes >= 0 ? minutes : minutes + 1440) / 60) * 10) / 10
}

export function timeAgo(value) {
  if (!value) return ''
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const units = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week']]
  let label = ''
  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size)
      label = `${n} ${name}${n === 1 ? '' : 's'} ago`
    }
  }
  return seconds > 2592000 ? formatDate(value) : label
}

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

export const isPast = (date) => date && new Date(`${date}T23:59:59`) < new Date()

export const splitList = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

// Event times are entered in Nigerian time (WAT, UTC+1, no daylight saving).
export function eventStart(date, time) {
  if (!date) return null
  return new Date(`${date}T${(time || '00:00').slice(0, 5)}:00+01:00`)
}

export function eventEnd(date, start, end) {
  const begin = eventStart(date, start)
  if (!begin) return null
  const finish = eventStart(date, end || start)
  // Ends at or before it starts → it runs past midnight.
  return finish <= begin ? new Date(finish.getTime() + 86400000) : finish
}

// 'upcoming' | 'live' | 'ended'
export function eventPhase(event) {
  const now = Date.now()
  const start = eventStart(event.event_date, event.start_time)
  const end = eventEnd(event.event_date, event.start_time, event.end_time)
  if (!start) return 'upcoming'
  if (now < start.getTime()) return 'upcoming'
  return now < end.getTime() ? 'live' : 'ended'
}

export const hasStarted = (job) => eventPhase(job) !== 'upcoming'

export function timeUntil(target) {
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return 'now'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}${minutes % 60 && hours < 6 ? ` ${minutes % 60} min` : ''}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
