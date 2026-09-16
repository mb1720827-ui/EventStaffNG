// EventStaff NG shared marketplace matching engine.
//
// This module is intentionally framework-agnostic so the matching logic and
// the AI staffing recommendation rules can be improved independently of the
// React components and without rebuilding the entire application. The
// weighting model mirrors the documented marketplace scoring system and is
// exposed as a configurable constant so it can be overridden by
// `platform_settings.matching.weights` at runtime.

export const MATCH_WEIGHTS = {
  category: 30,
  availability: 20,
  location: 15,
  skills: 15,
  verification: 10,
  rating: 5,
  pay: 5,
}

export const AVAILABLE_CATEGORIES = [
  'Chefs & Cooks',
  'Servers',
  'Bodyguards / Security',
  'Emcees / Hosts',
  'Cleaners',
  'Photographers / Videographers',
  'Chauffeurs',
  'Ushers / Protocol Officers',
]

export const EVENT_TYPES = [
  'Wedding',
  'Birthday',
  'Corporate event',
  'Conference',
  'Private party',
  'Other',
]

export const WORK_TYPES = ['full-day', 'part-time', 'short-duration', 'weekend', 'evening', 'night']

// Default budget per worker (per event) by category. Used to seed the
// staffing plan and to compare against worker rate preferences.
export const DEFAULT_BUDGETS = {
  'Chefs & Cooks': 40000,
  Servers: 25000,
  'Bodyguards / Security': 40000,
  'Emcees / Hosts': 35000,
  Cleaners: 15000,
  'Photographers / Videographers': 45000,
  Chauffeurs: 25000,
  'Ushers / Protocol Officers': 20000,
}

// Rule-based staffing templates. These act as the AI fallback so the platform
// keeps working when an external AI service is unavailable. Each entry maps a
// staff category to a ratio of guests-per-worker and a sensible floor.
const STAFFING_TEMPLATES = {
  Wedding: {
    'Servers': { perGuests: 25, min: 4 },
    'Ushers / Protocol Officers': { perGuests: 50, min: 2 },
    'Bodyguards / Security': { perGuests: 60, min: 2 },
    'Cleaners': { perGuests: 75, min: 2 },
    'Photographers / Videographers': { perGuests: 0, min: 2, fixed: true },
    'Chefs & Cooks': { perGuests: 50, min: 2 },
    'Emcees / Hosts': { perGuests: 0, min: 1, fixed: true },
  },
  Birthday: {
    'Servers': { perGuests: 30, min: 2 },
    'Ushers / Protocol Officers': { perGuests: 40, min: 1 },
    'Bodyguards / Security': { perGuests: 80, min: 1 },
    'Cleaners': { perGuests: 0, min: 2, fixed: true },
    'Photographers / Videographers': { perGuests: 0, min: 1, fixed: true },
  },
  'Corporate event': {
    'Servers': { perGuests: 40, min: 2 },
    'Ushers / Protocol Officers': { perGuests: 60, min: 2 },
    'Bodyguards / Security': { perGuests: 50, min: 2 },
    'Cleaners': { perGuests: 100, min: 1 },
    'Emcees / Hosts': { perGuests: 0, min: 1, fixed: true },
    'Photographers / Videographers': { perGuests: 0, min: 1, fixed: true },
  },
  Conference: {
    'Ushers / Protocol Officers': { perGuests: 70, min: 2 },
    'Bodyguards / Security': { perGuests: 50, min: 2 },
    'Servers': { perGuests: 50, min: 2 },
    'Cleaners': { perGuests: 80, min: 1 },
    'Emcees / Hosts': { perGuests: 0, min: 1, fixed: true },
    'Photographers / Videographers': { perGuests: 0, min: 1, fixed: true },
  },
  'Private party': {
    'Servers': { perGuests: 25, min: 2 },
    'Bodyguards / Security': { perGuests: 60, min: 1 },
    'Cleaners': { perGuests: 0, min: 2, fixed: true },
    'Photographers / Videographers': { perGuests: 0, min: 1, fixed: true },
  },
}

// Category-specific instructions that pre-fill the staffing builder.
export const CATEGORY_INSTRUCTIONS = {
  'Servers': 'Workers must arrive one hour before the event. Formal black-and-white attire required.',
  'Bodyguards / Security': 'Security personnel must arrive two hours early. Valid ID required on arrival.',
  'Ushers / Protocol Officers': 'Ushers must be familiar with guest seating and arrival protocols.',
  'Cleaners': 'Cleaning crew arrives after the event for full breakdown and cleanup.',
  'Chefs & Cooks': 'Kitchen team must report 2 hours before service. Bring relevant certifications.',
  'Photographers / Videographers': 'Full event coverage required. High-resolution deliverables expected.',
  'Emcees / Hosts': 'MC must arrive 1 hour early to brief with the client and review the run-of-show.',
  'Chauffeurs': 'Vehicles must be clean and arrive 30 minutes before pickup. Valid license required.',
}

// Minimum staffing floors adjusted for event duration (longer events need more staff).
const durationMultiplier = (hours) => {
  if (hours <= 4) return 1
  if (hours <= 8) return 1.25
  if (hours <= 12) return 1.5
  return 2
}

// Generate AI staffing recommendations from event details. This is the
// rule-based baseline engine. An external AI service could override the result
// of this function in the future without changing the UI.
export function generateStaffingRecommendations(event) {
  const guests = Number(event.guestCount || 0)
  const hours = Number(event.durationHours || 0) || computeDurationHours(event)
  const template = STAFFING_TEMPLATES[event.eventType] || STAFFING_TEMPLATES['Corporate event']
  const mult = durationMultiplier(hours)

  const recommendations = Object.entries(template).map(([category, rule]) => {
    const recommended = rule.fixed
      ? rule.min
      : Math.max(rule.min, Math.ceil((guests / rule.perGuests) * mult))
    return {
      category,
      recommended,
      defaultBudget: DEFAULT_BUDGETS[category] || 20000,
      instructions: CATEGORY_INSTRUCTIONS[category] || '',
    }
  })

  return recommendations.sort((a, b) => b.recommended - a.recommended)
}

function computeDurationHours(event) {
  if (!event.startTime || !event.endTime) return 0
  const start = Number(String(event.startTime).slice(0, 2))
  const end = Number(String(event.endTime).slice(0, 2))
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return end >= start ? end - start : end + 24 - start
}

// Helpers ------------------------------------------------------------------

export function money(value) {
  return `₦${Number(value || 0).toLocaleString()}`
}

// Does the worker prefer or primarily work this category?
function categoryMatch(job, worker) {
  if (!worker) return 0
  if (worker.primary_profession === job.category) return 1
  const prefs = worker.preferences?.preferred_categories || []
  if (prefs.includes(job.category)) return 1
  const skills = worker.skills || []
  if (skills.some((s) => s.toLowerCase().includes(job.category.toLowerCase()))) return 0.5
  return 0
}

// Is the worker available on the job date within the job's time window?
function availabilityMatch(job, worker) {
  if (!worker || !worker.availability) return 0.5
  const jobDate = job.event_date
  if (!jobDate) return 0.5
  const slot = worker.availability.find(
    (a) => a.available_date === jobDate || a.day_of_week === toDayOfWeek(jobDate)
  )
  if (!slot || slot.is_available === false) return 0
  if (slot.start_time && slot.end_time && job.start_time && job.end_time) {
    const jobStart = timeToMinutes(job.start_time)
    const slotStart = timeToMinutes(slot.start_time)
    const slotEnd = timeToMinutes(slot.end_time)
    if (jobStart < slotStart || jobStart > slotEnd) return 0
  }
  return 1
}

function toDayOfWeek(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  return isNaN(d.getTime()) ? null : d.getDay()
}

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = String(t).split(':').map(Number)
  return Number.isNaN(h) ? 0 : h * 60 + (Number.isNaN(m) ? 0 : m)
}

// Location proximity: 1 if the job is in a preferred location, 0.5 if within
// travel distance, 0 otherwise.
function locationMatch(job, worker) {
  if (!worker || !worker.preferences) return 0.5
  const prefs = worker.preferences
  const jobLocation = (job.location || '').toLowerCase()
  const preferred = [
    ...(prefs.preferred_states || []),
    ...(prefs.preferred_cities || []),
    ...(prefs.preferred_areas || []),
  ].map((s) => String(s).toLowerCase())

  if (job.location && preferred.some((p) => jobLocation.includes(p))) return 1
  if (prefs.max_travel_km && jobLocation.includes((worker.city || '').toLowerCase())) return 0.5
  return 0.5
}

// Skills experience: fraction (0..1) of worker skills relevant to the job.
function skillsMatch(job, worker) {
  if (!worker) return 0
  const skills = worker.skills || []
  if (!skills.length) return 0.5
  const cat = (job.category || '').toLowerCase()
  const relevant = skills.some((s) => s.toLowerCase().includes(cat) || s.toLowerCase().includes('event'))
  if (relevant) return 1
  return 0.5
}

// Verification status: 1 if identity + professional documents verified.
export function verificationMatch(worker) {
  if (!worker) return 0
  const docs = worker.documents || []
  const verifiedTypes = new Set(docs.filter((d) => d.status === 'verified').map((d) => d.document_type))
  if (worker.is_verified === true) return 1
  if (verifiedTypes.has('identity') && verifiedTypes.has('professional')) return 1
  if (verifiedTypes.has('identity')) return 0.5
  return 0
}

// Rating factor (0..1 normalized from 0..5).
function ratingMatch(worker) {
  if (!worker) return 0
  return Number(worker.rating || 0) / 5
}

// Pay factor: 1 if the job budget meets or exceeds the worker's minimum pay.
function payMatch(job, worker) {
  if (!worker || !worker.preferences) return 0.5
  const minPay = Number(worker.preferences.minimum_pay || worker.minimum_rate || 0)
  if (!minPay) return 1
  return Number(job.budget || 0) >= minPay ? 1 : 0.5
}

// Score how well a job matches a worker. Returns a rich object with the
// overall percentage and the per-factor breakdown.
export function scoreJobForWorker(job, worker) {
  const weights = MATCH_WEIGHTS
  const factors = {
    category: categoryMatch(job, worker) * weights.category,
    availability: availabilityMatch(job, worker) * weights.availability,
    location: locationMatch(job, worker) * weights.location,
    skills: skillsMatch(job, worker) * weights.skills,
    verification: verificationMatch(worker) * weights.verification,
    rating: ratingMatch(worker) * weights.rating,
    pay: payMatch(job, worker) * weights.pay,
  }
  const total = Math.round(Object.values(factors).reduce((sum, v) => sum + v, 0))
  return {
    score: Math.min(total, 100),
    factors,
    breakdown: [
      { label: 'Profession matches your primary category', value: categoryMatch(job, worker), weight: weights.category },
      { label: 'You are available on this date', value: availabilityMatch(job, worker), weight: weights.availability },
      { label: 'Within your preferred location', value: locationMatch(job, worker), weight: weights.location },
      { label: 'Your skills align with the role', value: skillsMatch(job, worker), weight: weights.skills },
      { label: 'Professional verification complete', value: verificationMatch(worker), weight: weights.verification },
      { label: 'Your rating', value: ratingMatch(worker), weight: weights.rating },
      { label: 'Pay meets your minimum', value: payMatch(job, worker), weight: weights.pay },
    ],
  }
}

// Score how well a worker matches a job (hirer-facing recommendation).
export function scoreWorkerForJob(worker, job) {
  const weights = MATCH_WEIGHTS
  const factors = {
    category: categoryMatch(job, worker) * weights.category,
    availability: availabilityMatch(job, worker) * weights.availability,
    location: locationMatch(job, worker) * weights.location,
    skills: skillsMatch(job, worker) * weights.skills,
    verification: verificationMatch(worker) * weights.verification,
    rating: ratingMatch(worker) * weights.rating,
    pay: payMatch(job, worker) * weights.pay,
  }
  const total = Math.round(Object.values(factors).reduce((sum, v) => sum + v, 0))
  return {
    score: Math.min(total, 100),
    factors,
    breakdown: [
      { label: 'Profession matches the job', value: categoryMatch(job, worker), weight: weights.category },
      { label: 'Available on the event date', value: availabilityMatch(job, worker), weight: weights.availability },
      { label: 'Located near the event', value: locationMatch(job, worker), weight: weights.location },
      { label: 'Skills meet the requirements', value: skillsMatch(job, worker), weight: weights.skills },
      { label: 'Verification complete', value: verificationMatch(worker), weight: weights.verification },
      { label: 'Rating and experience', value: ratingMatch(worker), weight: weights.rating },
      { label: 'Rate is within budget', value: payMatch(job, worker), weight: weights.pay },
    ],
  }
}

// Determine whether a worker has satisfied the category-specific verification
// requirements and therefore qualifies for the verified badge.
export function isWorkerVerified(worker) {
  if (!worker) return false
  if (worker.is_verified === true) return true
  const docs = worker.documents || []
  const verified = new Set(docs.filter((d) => d.status === 'verified').map((d) => d.document_type))
  if (verified.has('identity') && verified.has('professional')) return true
  return false
}

// Compute the recommended staffing configuration for a job. Returns the
// required count and per-worker budget from the event_requirements row, with
// sensible defaults otherwise.
export function jobStaffing(job) {
  return {
    workersRequired: Number(job.workers_required || 1),
    budget: Number(job.budget || 0),
    location: job.location,
    category: job.category,
  }
}
