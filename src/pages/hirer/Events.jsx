import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, EmptyState, Icon, PageHeader, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { EVENT_STATUS } from '../../lib/constants'
import { isPast, timeRange } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

export function EventCard({ event }) {
  const jobs = event.job_posts || []
  const needed = jobs.reduce((sum, job) => sum + job.workers_required, 0)
  const booked = (event.bookings || []).filter((b) => b.status !== 'cancelled').length
  const pct = needed ? Math.min(100, Math.round((booked / needed) * 100)) : 0
  const d = new Date(`${event.event_date}T00:00:00`)
  return <NavLink to={`/hirer/events/${event.id}`} className="event-card">
    <div className="date-tile"><span>{d.toLocaleDateString('en-NG', { month: 'short' })}</span><strong>{d.getDate()}</strong></div>
    <div className="event-card-body">
      <div className="row between wrap-gap"><h3>{event.event_name}</h3><StatusBadge map={EVENT_STATUS} value={event.status} /></div>
      <p className="meta"><span><Icon name="Tag" size={14} />{event.event_type}</span><span><Icon name="Clock" size={14} />{timeRange(event.start_time, event.end_time)}</span><span><Icon name="MapPin" size={14} />{event.location}</span></p>
      {needed > 0 && <div className="fill">
        <div className="progress"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
        <span>{booked}/{needed} staff booked</span>
      </div>}
    </div>
    <Icon name="ChevronRight" size={20} className="chev" />
  </NavLink>
}

export default function Events() {
  const { session } = useSession()
  const [tab, setTab] = useState('upcoming')
  const { data, loading, error } = useLoader(async () => must(await supabase.from('events')
    .select('*, job_posts(id,workers_required,status), bookings(id,status)')
    .eq('hirer_id', session.user.id).order('event_date', { ascending: true })), [session])

  const events = data || []
  const groups = {
    upcoming: events.filter((e) => e.status !== 'cancelled' && e.status !== 'completed' && !isPast(e.event_date)),
    past: events.filter((e) => e.status !== 'cancelled' && (e.status === 'completed' || isPast(e.event_date))).reverse(),
    cancelled: events.filter((e) => e.status === 'cancelled'),
  }

  return <Workspace role="hirer">
    <PageHeader eyebrow="Events" title="Your events" description="Track hiring progress for every occasion." actions={<NavLink to="/hirer/post-event" className="btn btn-primary"><Icon name="Plus" size={16} />Post an event</NavLink>} />
    <Tabs value={tab} onChange={setTab} tabs={[['upcoming', 'Upcoming', groups.upcoming.length], ['past', 'Past', groups.past.length], ['cancelled', 'Cancelled', groups.cancelled.length]]} />
    <Alert tone="danger">{error?.message}</Alert>
    {loading ? <Spinner /> : groups[tab].length
      ? <div className="stack">{groups[tab].map((event) => <EventCard event={event} key={event.id} />)}</div>
      : <EmptyState icon="CalendarPlus" title={tab === 'upcoming' ? 'No upcoming events' : `No ${tab} events`} action={tab === 'upcoming' && <NavLink to="/hirer/post-event" className="btn btn-primary">Post your first event</NavLink>}>
        {tab === 'upcoming' ? 'Post an event and we\'ll recommend a team and notify matching professionals.' : 'They\'ll show up here.'}
      </EmptyState>}
  </Workspace>
}
