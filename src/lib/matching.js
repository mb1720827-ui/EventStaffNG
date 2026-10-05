// EventStaff NG shared marketplace matching engine.
//
// Framework-agnostic so the matching logic and the AI staffing recommendation
// rules can evolve independently of the React components. Weights mirror
// `platform_settings.matching.weights`.

import { CATEGORY_TITLES } from './constants'
export { money } from './format'

export const MATCH_WEIGHTS = {
  category: 30,
  availability: 20,
  location: 15,
  skills: 15,
  verification: 10,
  rating: 5,
  pay: 5,
}

export const MIN_MATCH_THRESHOLD = 60

export const AVAILABLE_CATEGORIES = CATEGORY_TITLES

export const EVENT_TYPES = [
  'Wedding',
  'Birthday',
  'Corporate event',
  'Conference',
  'Product launch',
  'Government function',
  'Naming ceremony',
  'Burial / Memorial',
  'Concert / Festival',
  'Private party',
  'Other',
]

export const WORK_TYPES = ['Full day', 'Part time', 'Short shifts', 'Weekends', 'Evenings', 'Overnight']

// Default budget per worker (per event) by category.
export const DEFAULT_BUDGETS = {
  'Chefs & Cooks': 40000,
  Servers: 20000,
  'Bodyguards / Security': 35000,
  'Emcees / Hosts': 80000,
  Cleaners: 15000,
  'Photographers / Videographers': 120000,
  Chauffeurs: 25000,
  'Ushers / Protocol Officers': 18000,
}

// Rule-based staffing templates: guests-per-worker ratio and a sensible floor.
// `fixed` roles don't scale with guest count.
const STAFFING_TEMPLATES = {
  Wedding: {
    Servers: { perGuests: 20, min: 4 },
    'Ushers / Protocol Officers': { perGuests: 60, min: 2 },
    'Bodyguards / Security': { perGuests: 100, min: 2 },
    Cleaners: { perGuests: 80, min: 2 },
    'Chefs & Cooks': { perGuests: 60, min: 2 },
    'Photographers / Videographers': { fixed: true, min: 2 },
    'Emcees / Hosts': { fixed: true, min: 1 },
  },
  Birthday: {
    Servers: { perGuests: 25, min: 2 },
    'Ushers / Protocol Officers': { perGuests: 60, min: 1 },
    Cleaners: { fixed: true, min: 2 },
    'Photographers / Videographers': { fixed: true, min: 1 },
    'Emcees / Hosts': { fixed: true, min: 1 },
  },
  'Corporate event': {
    Servers: { perGuests: 30, min: 2 },
    'Ushers / Protocol Officers': { perGuests: 50, min: 2 },
    'Bodyguards / Security': { perGuests: 80, min: 2 },
    Cleaners: { perGuests: 100, min: 1 },
    'Emcees / Hosts': { fixed: true, min: 1 },
    'Photographers / Videographers': { fixed: true, min: 1 },
  },
  Conference: {
    'Ushers / Protocol Officers': { perGuests: 50, min: 2 },
    'Bodyguards / Security': { perGuests: 80, min: 2 },
    Servers: { perGuests: 50, min: 2 },
    Cleaners: { perGuests: 100, min: 1 },
    'Emcees / Hosts': { fixed: true, min: 1 },
    'Photographers / Videographers': { fixed: true, min: 1 },
  },
  'Product launch': {
    'Ushers / Protocol Officers': { perGuests: 40, min: 2 },
    Servers: { perGuests: 30, min: 2 },
    'Bodyguards / Security': { perGuests: 80, min: 1 },
    'Emcees / Hosts': { fixed: true, min: 1 },
    'Photographers / Videographers': { fixed: true, min: 2 },
  },
  'Government function': {
    'Ushers / Protocol Officers': { perGuests: 30, min: 4 },
    'Bodyguards / Security': { perGuests: 40, min: 4 },
    Servers: { perGuests: 30, min: 2 },
    Chauffeurs: { perGuests: 50, min: 2 },
    Cleaners: { perGuests: 100, min: 1 },
    'Photographers / Videographers': { fixed: true, min: 1 },
  },
  'Naming ceremony': {
    Servers: { perGuests: 25, min: 2 },
    'Chefs & Cooks': { perGuests: 60, min: 1 },
    Cleaners: { fixed: true, min: 1 },
    'Photographers / Videographers': { fixed: true, min: 1 },
  },
  'Burial / Memorial': {
    'Ushers / Protocol Officers': { perGuests: 50, min: 2 },
    Servers: { perGuests: 25, min: 3 },
    'Bodyguards / Security': { perGuests: 100, min: 1 },
    Cleaners: { perGuests: 100, min: 2 },
    'Chefs & Cooks': { perGuests: 60, min: 2 },
    'Photographers / Videographers': { fixed: true, min: 1 },
  },
  'Concert / Festival': {
    'Bodyguards / Security': { perGuests: 50, min: 6 },
    'Ushers / Protocol Officers': { perGuests: 100, min: 4 },
    Cleaners: { perGuests: 150, min: 4 },
    'Emcees / Hosts': { fixed: true, min: 1 },
    'Photographers / Videographers': { fixed: true, min: 2 },
  },
  'Private party': {
    Servers: { perGuests: 20, min: 2 },
    'Bodyguards / Security': { perGuests: 80, min: 1 },
    Cleaners: { fixed: true, min: 2 },
    'Photographers / Videographers': { fixed: true, min: 1 },
  },
}

export const CATEGORY_INSTRUCTIONS = {
  Servers: 'Arrive one hour before guests. Black-and-white attire unless the client specifies otherwise.',
  'Bodyguards / Security': 'Arrive two hours early for the venue walk-through. Valid ID required on arrival.',
  'Ushers / Protocol Officers': 'Arrive early to learn the seating plan and VIP arrival protocol.',
  Cleaners: 'Cover setup, upkeep during the event, and full breakdown afterwards.',
  'Chefs & Cooks': 'Report two hours before service. Bring relevant certifications.',
  'Photographers / Videographers': 'Full event coverage. Agree deliverables and turnaround with the client.',
  'Emcees / Hosts': 'Arrive one hour early to brief with the client and review the run-of-show.',
  Chauffeurs: 'Vehicle clean and on site 30 minutes before first pickup. Valid licence required.',
}

const durationMultiplier = (hours) => {
  if (hours <= 4) return 1
  if (hours <= 8) return 1.25
  if (hours <= 12) return 1.5
  return 2
}

// Rule-based staffing engine (`ai.staffing_engine = 'rules'`). An external AI
// service can replace this function without touching the UI.
export function generateStaffingRecommendations(event) {
  const guests = Number(event.guestCount || 0)
  const hours = Number(event.durationHours || 0) || computeDurationHours(event)
  const template = STAFFING_TEMPLATES[event.eventType] || STAFFING_TEMPLATES['Corporate event']
  const mult = durationMultiplier(hours)

  return Object.entries(template)
    .map(([category, rule]) => {
      const recommended = rule.fixed ? rule.min : Math.max(rule.min, Math.ceil((guests / rule.perGuests) * mult))
      const reason = rule.fixed
        ? `${rule.min} recommended for any ${event.eventType?.toLowerCase() || 'event'}`
        : `About 1 per ${rule.perGuests} guests${mult > 1 ? `, scaled up for a ${hours}-hour event` : ''}`
      return {
        category,
        recommended,
        reason,
        defaultBudget: DEFAULT_BUDGETS[category] || 20000,
        instructions: CATEGORY_INSTRUCTIONS[category] || '',
      }
    })
    .sort((a, b) => b.recommended - a.recommended)
}

function computeDurationHours(event) {
  if (!event.startTime || !event.endTime) return 0
  const [sh, sm = 0] = String(event.startTime).split(':').map(Number)
  const [eh, em = 0] = String(event.endTime).split(':').map(Number)
  if (Number.isNaN(sh) || Number.isNaN(eh)) return 0
  const minutes = eh * 60 + em - (sh * 60 + sm)
  return (minutes >= 0 ? minutes : minutes + 1440) / 60
}

// Factors -------------------------------------------------------------------

const lower = (value) => String(value || '').toLowerCase()
const skillList = (worker) => (worker?.skills || []).map((item) => lower(typeof item === 'string' ? item : item?.skill))

function categoryMatch(job, worker) {
  if (!worker) return 0
  if (worker.primary_profession === job.category || worker.category === job.category) return 1
  if ((worker.preferences?.preferred_categories || []).includes(job.category)) return 0.8
  if (skillList(worker).some((skill) => skill && lower(job.category).includes(skill))) return 0.5
  return 0
}

function availabilityMatch(job, worker) {
  const slots = worker?.availability || []
  const dates = worker?.preferences?.available_dates || []
  if (!job.event_date) return 0.5
  if (dates.includes(job.event_date)) return 1
  if (!slots.length) return dates.length ? 0.3 : 0.5
  const slot = slots.find((item) => item.available_date === job.event_date || (item.available_date == null && item.day_of_week === toDayOfWeek(job.event_date)))
  if (!slot || slot.is_available === false) return 0
  if (slot.start_time && slot.end_time && job.start_time) {
    const start = timeToMinutes(job.start_time)
    if (start < timeToMinutes(slot.start_time) || start > timeToMinutes(slot.end_time)) return 0.5
  }
  return 1
}

function toDayOfWeek(dateString) {
  const d = new Date(`${dateString}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.getDay()
}

function timeToMinutes(t) {
  const [h, m] = String(t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function locationMatch(job, worker) {
  if (!worker) return 0.5
  const prefs = worker.preferences || {}
  const haystack = lower([job.location, job.area, job.state].filter(Boolean).join(' '))
  const preferredAreas = [...(prefs.preferred_areas || []), ...(prefs.preferred_cities || [])].map(lower)
  if (preferredAreas.some((area) => area && haystack.includes(area))) return 1
  const states = [...(prefs.preferred_states || []), worker.state].filter(Boolean).map(lower)
  if (job.state && states.includes(lower(job.state))) return 0.8
  if (states.some((state) => haystack.includes(state.replace(/\s*\(.*\)/, '')) || (state.includes('abuja') && haystack.includes('abuja')))) return 0.8
  if (worker.city && haystack.includes(lower(worker.city))) return 0.8
  return states.length ? 0.2 : 0.5
}

function skillsMatch(job, worker) {
  const skills = skillList(worker)
  if (!skills.length) return 0.5
  const text = lower(`${job.category} ${job.title} ${job.description}`)
  return skills.some((skill) => skill && text.includes(skill)) ? 1 : 0.6
}

export function verificationMatch(worker) {
  if (!worker) return 0
  if (worker.is_verified === true) return 1
  const verified = new Set((worker.documents || []).filter((d) => d.status === 'verified').map((d) => d.document_type))
  if (verified.has('identity') && verified.has('professional')) return 1
  if (verified.has('identity')) return 0.5
  return 0
}

function ratingMatch(worker) {
  const rating = Number(worker?.rating || 0)
  return rating ? rating / 5 : 0.6 // new workers aren't penalised to zero
}

function payMatch(job, worker) {
  const minPay = Number(worker?.preferences?.minimum_pay || worker?.minimum_rate || 0)
  if (!minPay) return 1
  const budget = Number(job.budget || 0)
  if (budget >= minPay) return 1
  return budget >= minPay * 0.8 ? 0.5 : 0
}

function score(job, worker, labels) {
  const values = {
    category: categoryMatch(job, worker),
    availability: availabilityMatch(job, worker),
    location: locationMatch(job, worker),
    skills: skillsMatch(job, worker),
    verification: verificationMatch(worker),
    rating: ratingMatch(worker),
    pay: payMatch(job, worker),
  }
  const total = Object.entries(values).reduce((sum, [key, value]) => sum + value * MATCH_WEIGHTS[key], 0)
  return {
    score: Math.min(Math.round(total), 100),
    breakdown: Object.entries(values).map(([key, value]) => ({ key, label: labels[key], value, weight: MATCH_WEIGHTS[key] })),
  }
}

export const scoreJobForWorker = (job, worker) => score(job, worker, {
  category: 'Matches your profession',
  availability: 'You are available that day',
  location: 'In your preferred location',
  skills: 'Uses your skills',
  verification: 'Your verification status',
  rating: 'Your rating',
  pay: 'Pay meets your minimum',
})

export const scoreWorkerForJob = (worker, job) => score(job, worker, {
  category: 'Profession matches the role',
  availability: 'Available on the event date',
  location: 'Close to the venue',
  skills: 'Relevant skills',
  verification: 'Verified by EventStaff NG',
  rating: 'Rating and track record',
  pay: 'Rate fits your budget',
})

export function isWorkerVerified(worker) {
  if (!worker) return false
  if (worker.is_verified === true) return true
  const verified = new Set((worker.documents || []).filter((d) => d.status === 'verified').map((d) => d.document_type))
  return verified.has('identity') && verified.has('professional')
}

// Per-category document checklist (mirrors the verification_requirements seed).
export const REQUIRED_DOCUMENTS = {
  'Chefs & Cooks': [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['professional', 'Culinary certificate', true], ['training', 'Food-handling / hygiene training', false]],
  Servers: [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['training', 'Hospitality training certificate', false]],
  'Bodyguards / Security': [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['professional', 'Security licence or service credentials', true], ['training', 'Security training record', true], ['background', 'Police character certificate', true]],
  'Emcees / Hosts': [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['professional', 'Showreel or event portfolio', false]],
  Cleaners: [['identity', 'Government-issued ID (NIN, passport, or voter card)', true]],
  'Photographers / Videographers': [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['professional', 'Portfolio evidence', true], ['training', 'Professional training', false]],
  Chauffeurs: [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['professional', "Valid driver's licence", true], ['training', 'Defensive driving certificate', false]],
  'Ushers / Protocol Officers': [['identity', 'Government-issued ID (NIN, passport, or voter card)', true], ['training', 'Hospitality / protocol training', false]],
}

export const requiredDocsFor = (category) =>
  (REQUIRED_DOCUMENTS[category] || [['identity', 'Government-issued ID (NIN, passport, or voter card)', true]])
    .map(([document_type, label, required]) => ({ document_type, label, required }))
