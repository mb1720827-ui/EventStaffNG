// Platform-wide reference data for EventStaff NG.
//
// Pricing figures below are launch defaults. Change them here and every page
// (landing, pricing, booking summaries) picks them up. The commission rate must
// match `billing.commission_rate` in platform_settings, which the database uses
// when it creates a payout record for a completed booking.

export const CATEGORIES = [
  {
    title: 'Chefs & Cooks',
    slug: 'chefs',
    icon: 'ChefHat',
    description: 'Professional catering teams for weddings, birthdays, and corporate events.',
    roles: ['Head chef', 'Sous chef', 'Continental & local cuisine', 'Pastry & small chops', 'Grill & suya'],
    vetting: 'Culinary certificate and food-handling training verified.',
  },
  {
    title: 'Servers',
    slug: 'servers',
    icon: 'UtensilsCrossed',
    description: 'Polished front-of-house and banquet staff for seamless guest service.',
    roles: ['Banquet servers', 'Waiters & waitresses', 'Bartenders', 'Buffet attendants', 'Cocktail service'],
    vetting: 'Identity verified and trained in table and banquet service.',
  },
  {
    title: 'Bodyguards / Security',
    slug: 'security',
    icon: 'ShieldCheck',
    description: 'Verified, trained security professionals for high-trust environments.',
    roles: ['Close protection', 'Access control', 'Crowd management', 'VIP escort', 'Venue patrol'],
    vetting: 'Security credentials, training records and background checks verified.',
  },
  {
    title: 'Emcees / Hosts',
    slug: 'emcees',
    icon: 'Mic',
    description: 'Confident MCs and hosts who keep the energy high and the programme on time.',
    roles: ['Wedding MC', 'Corporate host', 'Hype man', 'Bilingual compère', 'Conference moderator'],
    vetting: 'Identity verified, showreel and event history reviewed.',
  },
  {
    title: 'Cleaners',
    slug: 'cleaners',
    icon: 'Sparkles',
    description: 'Event-ready cleaning teams for setup, breakdown, and a spotless finish.',
    roles: ['Pre-event setup', 'During-event upkeep', 'Post-event breakdown', 'Restroom attendants'],
    vetting: 'Identity verified and supervised by team leads.',
  },
  {
    title: 'Photographers / Videographers',
    slug: 'media',
    icon: 'Camera',
    description: 'Visual storytellers for weddings, launches, conferences, and live coverage.',
    roles: ['Event photography', 'Cinematography', 'Drone coverage', 'Live streaming', 'Photo booth'],
    vetting: 'Portfolio evidence and identity verified.',
  },
  {
    title: 'Chauffeurs',
    slug: 'chauffeurs',
    icon: 'Car',
    description: 'Professional drivers for VIP transfers, guest shuttles, and event logistics.',
    roles: ['VIP chauffeur', 'Guest shuttle', 'Airport transfers', 'Convoy driving'],
    vetting: "Valid driver's licence and identity verified.",
  },
  {
    title: 'Ushers / Protocol Officers',
    slug: 'ushers',
    icon: 'Handshake',
    description: 'Guest-flow experts and protocol specialists for formal and high-profile events.',
    roles: ['Ushers', 'Protocol officers', 'Registration desk', 'Hostesses', 'VIP liaison'],
    vetting: 'Identity verified and trained in hospitality and protocol.',
  },
]

export const CATEGORY_TITLES = CATEGORIES.map((item) => item.title)
export const categoryMeta = (title) => CATEGORIES.find((item) => item.title === title)

export const LAUNCH_STATES = ['FCT (Abuja)', 'Lagos']
export const STATE_AREAS = {
  'FCT (Abuja)': ['Maitama', 'Wuse', 'Wuse II', 'Garki', 'Asokoro', 'Gwarinpa', 'Jabi', 'Utako', 'Lugbe', 'Kubwa', 'Life Camp', 'Katampe'],
  Lagos: ['Victoria Island', 'Ikoyi', 'Lekki', 'Ajah', 'Ikeja', 'Surulere', 'Yaba', 'Maryland', 'Gbagada', 'Magodo', 'Festac', 'Epe'],
}

export const ORGANIZATION_TYPES = ['Individual', 'Family', 'Event Planner', 'Corporate', 'Government', 'Hospitality', 'Other']

export const AUDIENCES = [
  { icon: 'CalendarHeart', title: 'Event planners', body: 'Staff multiple events a month without chasing contacts on WhatsApp.' },
  { icon: 'Building2', title: 'Corporate entities', body: 'Product launches, AGMs, end-of-year parties, and conferences.' },
  { icon: 'Landmark', title: 'Government agencies', body: 'Protocol officers, ushers, and security for official functions.' },
  { icon: 'Home', title: 'Families', body: 'Weddings, naming ceremonies, birthdays, and burials done right.' },
  { icon: 'Hotel', title: 'Hospitality businesses', body: 'Hotels, lounges, and caterers covering peak-season shortfalls.' },
]

// Revenue model: service commission + subscriptions + corporate retainers + staff registration.
export const COMMISSION_RATE = 0.1

export const HIRER_PLANS = [
  {
    id: 'payg',
    name: 'Pay as you go',
    price: 0,
    period: 'No monthly fee',
    blurb: 'For families and one-off celebrations.',
    features: ['Post unlimited events', 'AI staffing recommendations', 'Verified professionals only', `${COMMISSION_RATE * 100}% service commission per booking`],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Planner Pro',
    price: 25000,
    period: 'per month',
    blurb: 'For event planners and caterers who book every week.',
    features: ['Everything in Pay as you go', 'Reduced 6% service commission', 'Priority matching & shortlists', 'Saved teams you can rebook', 'Dedicated WhatsApp support line'],
    cta: 'Choose Pro',
    featured: true,
  },
  {
    id: 'corporate',
    name: 'Corporate retainer',
    price: null,
    period: 'Custom quarterly or annual',
    blurb: 'For corporates, government agencies, and hotels.',
    features: ['Guaranteed staff availability', 'Named account manager', 'Consolidated monthly invoicing', 'Custom vetting & uniform briefs', 'Service-level agreement'],
    cta: 'Talk to sales',
  },
]

export const WORKER_REGISTRATION_FEE = 5000

export const EVENT_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  matching: { label: 'Hiring', tone: 'info' },
  booked: { label: 'Fully booked', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

export const APPLICATION_STATUS = {
  Applied: { label: 'Applied', tone: 'info' },
  Shortlisted: { label: 'Shortlisted', tone: 'warning' },
  Accepted: { label: 'Hired', tone: 'success' },
  Rejected: { label: 'Not selected', tone: 'danger' },
  Withdrawn: { label: 'Withdrawn', tone: 'neutral' },
}

export const BOOKING_STATUS = {
  pending: { label: 'Awaiting worker', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

export const DOCUMENT_STATUS = {
  not_submitted: { label: 'Not submitted', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  under_review: { label: 'Under review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

export const PAYMENT_STATUS = {
  pending: { label: 'Pending payout', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
}
