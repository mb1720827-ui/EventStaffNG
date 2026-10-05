import { useState } from 'react'
import { Icon } from '../../components/ui'
import { COMMISSION_RATE, WORKER_REGISTRATION_FEE } from '../../lib/constants'
import { money } from '../../lib/format'

export const HIRER_STEPS = [
  { icon: 'ClipboardList', title: 'Describe your event', body: 'Event type, date, venue and guest count. Takes about two minutes.' },
  { icon: 'Sparkles', title: 'Get an AI staffing plan', body: 'We recommend how many of each role you need, with budgets. Edit anything.' },
  { icon: 'Users', title: 'Review matched professionals', body: 'Verified workers apply and are ranked by fit. Shortlist, compare, and hire.' },
  { icon: 'CircleCheckBig', title: 'Confirm, run, and rate', body: 'Workers confirm their booking. After the event, mark it complete and leave a review.' },
]

export const WORKER_STEPS = [
  { icon: 'UserRoundPen', title: 'Build your profile', body: 'Your profession, experience, rates, locations and availability.' },
  { icon: 'ShieldCheck', title: 'Get verified', body: 'Upload your ID and role credentials. Our team reviews them, usually within 48 hours.' },
  { icon: 'BriefcaseBusiness', title: 'Get matched to jobs', body: 'See jobs ranked by how well they fit you, and get alerts when new ones are posted.' },
  { icon: 'Wallet', title: 'Work and get paid', body: 'Accept bookings, show up, and get paid through the platform. Ratings win you more work.' },
]

export const FAQS = [
  ['How are professionals verified?', 'Every professional uploads a government-issued ID plus credentials for their role — for example a culinary certificate for chefs, a security licence and police character certificate for security, or a valid driver\'s licence for chauffeurs. Our operations team reviews each document. Only approved professionals appear in search and carry the Verified badge.'],
  ['What does it cost to hire?', `Posting an event is free. When you book someone, a ${COMMISSION_RATE * 100}% service fee is added to the agreed rate. Planner Pro subscribers pay a reduced fee, and corporate retainers are priced to your volume.`],
  ['How do workers get paid?', 'When the hirer marks a booking complete, the worker\'s payout is queued and paid out by EventStaff NG. Workers can track every payment on their Earnings page.'],
  ['What if a worker cancels?', 'You\'re notified immediately and the role reopens on the marketplace so other matched professionals can apply. Workers who cancel late lose ranking.'],
  ['Is there a fee to join as a worker?', `A one-time ${money(WORKER_REGISTRATION_FEE)} registration fee covers document verification and onboarding. There's no commission taken from your pay.`],
  ['Which cities do you cover?', 'We are live across the Federal Capital Territory (Abuja) and Lagos State. More states are on the roadmap — contact us if you need staff elsewhere.'],
]

export function Faq({ items = FAQS }) {
  const [open, setOpen] = useState(0)
  return <div className="faq">
    {items.map(([q, a], index) => <div className={`faq-item ${open === index ? 'open' : ''}`} key={q}>
      <button onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}>{q}<Icon name="ChevronDown" size={18} /></button>
      {open === index && <p>{a}</p>}
    </div>)}
  </div>
}
