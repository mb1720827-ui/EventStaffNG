import { useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import ReviewModal from '../../components/ReviewModal'
import { RatingTag } from '../../components/Ratings'
import Workspace from '../../components/Workspace'
import { Alert, Avatar, EmptyState, Icon, PageHeader, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { BOOKING_STATUS, COMMISSION_RATE } from '../../lib/constants'
import { formatDate, isPast, money, timeRange } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

export default function Bookings() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'pending'
  const [reviewing, setReviewing] = useState(null)
  const [message, setMessage] = useState('')
  const { data, loading, error, reload } = useLoader(async () => {
    const [bookings, reviews] = await Promise.all([
      supabase.from('bookings').select('*, staff_profiles(id,name,category,location,rating,review_count), events(id,event_name,event_date,start_time,end_time,location)').eq('hirer_id', session.user.id).order('created_at', { ascending: false }),
      supabase.from('reviews').select('booking_id').eq('reviewer_id', session.user.id),
    ])
    return { bookings: must(bookings), reviewed: new Set((reviews.data || []).map((r) => r.booking_id)) }
  }, [session])

  const update = async (booking, status, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    const { error: updateError } = await supabase.from('bookings').update({ status }).eq('id', booking.id)
    if (updateError) return setMessage(`danger:${updateError.message}`)
    if (status === 'completed') { setMessage(`success:Marked complete — ${booking.staff_profiles?.name}'s payout is queued.`); setReviewing(booking) }
    else setMessage('success:Booking cancelled. The role has reopened for applicants.')
    reload()
  }

  const bookings = data?.bookings || []
  const groups = { pending: [], confirmed: [], completed: [], cancelled: [] }
  bookings.forEach((b) => groups[b.status]?.push(b))
  const [tone, text] = message ? message.split(/:(.*)/s) : []

  return <Workspace role="hirer">
    <PageHeader eyebrow="Bookings" title="Your booked professionals" description="Track offers, confirmations and completed jobs. Mark jobs complete after the event so professionals get paid." />
    <Tabs value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} tabs={[['pending', 'Awaiting worker', groups.pending.length], ['confirmed', 'Confirmed', groups.confirmed.length], ['completed', 'Completed', groups.completed.length], ['cancelled', 'Cancelled', groups.cancelled.length]]} />
    <Alert tone={tone} onClose={() => setMessage('')}>{text}</Alert>
    <Alert tone="danger">{error?.message}</Alert>
    {loading && !data ? <Spinner /> : groups[tab].length ? <div className="table-card card">
      {groups[tab].map((b) => {
        const past = isPast(b.events?.event_date)
        return <div className="booking-row" key={b.id}>
          <Avatar name={b.staff_profiles?.name} size="md" />
          <div className="booking-main">
            <div className="row wrap-gap"><NavLink to={`/hirer/staff/${b.staff_profiles?.id}`}><strong>{b.staff_profiles?.name}</strong></NavLink><span className="muted">{b.staff_profiles?.category}</span><RatingTag rating={b.staff_profiles?.rating} count={b.staff_profiles?.review_count} size="sm" /></div>
            <div className="meta"><NavLink to={`/hirer/events/${b.events?.id}`}><Icon name="CalendarDays" size={14} />{b.events?.event_name}</NavLink><span>{formatDate(b.events?.event_date)} · {timeRange(b.events?.start_time, b.events?.end_time)}</span></div>
          </div>
          <div className="booking-amount"><strong>{money(b.agreed_amount)}</strong><span className="muted small">+ {money(b.agreed_amount * COMMISSION_RATE)} fee</span></div>
          <div className="booking-actions">
            <StatusBadge map={BOOKING_STATUS} value={b.status} />
            {b.status === 'confirmed' && <button className={`btn btn-sm ${past ? 'btn-primary' : 'btn-secondary'}`} onClick={() => update(b, 'completed', past ? null : 'This event hasn\'t happened yet. Mark the job complete anyway?')}><Icon name="CircleCheck" size={15} />Mark complete</button>}
            {['pending', 'confirmed'].includes(b.status) && <button className="btn btn-ghost btn-sm danger-text" onClick={() => update(b, 'cancelled', `Cancel ${b.staff_profiles?.name}'s booking?`)}>Cancel</button>}
            {b.status === 'completed' && !data.reviewed.has(b.id) && <button className="btn btn-accent btn-sm" onClick={() => setReviewing(b)}><Icon name="Star" size={15} />Rate experience</button>}
            {b.status === 'completed' && data.reviewed.has(b.id) && <span className="muted small"><Icon name="Check" size={14} />Reviewed</span>}
          </div>
        </div>
      })}
    </div> : <EmptyState icon="ClipboardList" title={{ pending: 'No offers awaiting a response', confirmed: 'No confirmed bookings', completed: 'No completed jobs yet', cancelled: 'No cancellations' }[tab]} action={tab === 'pending' && <NavLink to="/hirer/find-staff" className="btn btn-primary">Find staff</NavLink>}>
      {tab === 'pending' ? 'When you hire an applicant or book someone directly, the offer waits here until they accept.' : null}
    </EmptyState>}
    <ReviewModal booking={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); setMessage('success:Thanks — your review is live on their profile.'); reload() }} />
  </Workspace>
}
