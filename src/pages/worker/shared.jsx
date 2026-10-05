import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Badge, CategoryIcon, Icon, MatchPill } from '../../components/ui'
import { formatDate, money, timeRange } from '../../lib/format'
import { supabase } from '../../lib/supabase'

export function JobCard({ job, applied }) {
  return <NavLink to={`/worker/jobs/${job.id}`} className="job-card">
    <div className="job-card-top">
      <CategoryIcon category={job.category} size={18} />
      <span className="muted small">{job.category}</span>
      {job.matchScore != null && <MatchPill score={job.matchScore} />}
    </div>
    <h3>{job.events?.event_name || job.title.split(' — ')[0]}</h3>
    <ul className="job-facts">
      <li><Icon name="CalendarDays" size={15} />{formatDate(job.event_date)}</li>
      <li><Icon name="Clock" size={15} />{timeRange(job.start_time, job.end_time)}</li>
      <li><Icon name="MapPin" size={15} />{job.location}</li>
    </ul>
    <div className="job-card-foot">
      <div><strong className="pay">{money(job.budget)}</strong><span className="muted small"> per person</span></div>
      {applied ? <Badge tone="success" icon="Check">Applied</Badge> : <span className="muted small">{job.workers_required} needed</span>}
    </div>
  </NavLink>
}

// Accept / decline a booking offer inline.
export function OfferActions({ booking, onDone }) {
  const [busy, setBusy] = useState(false)
  const respond = async (status) => {
    if (status === 'cancelled' && !window.confirm('Decline this booking? The hirer will be notified.')) return
    setBusy(true)
    await supabase.from('bookings').update({ status }).eq('id', booking.id)
    setBusy(false)
    onDone?.()
  }
  return <div className="row">
    <button className="btn btn-ghost btn-sm danger-text" disabled={busy} onClick={() => respond('cancelled')}>Decline</button>
    <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => respond('confirmed')}><Icon name="Check" size={15} />Accept</button>
  </div>
}

export const BOOKING_SELECT = '*, events(event_name,event_type,event_date,start_time,end_time,location,instructions), job_posts(title,category,description), hirer:profiles!bookings_hirer_id_fkey(full_name,phone)'
