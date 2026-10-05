import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import BookModal from '../../components/BookModal'
import { RatingSummary, RatingTag, ReviewList } from '../../components/Ratings'
import Workspace from '../../components/Workspace'
import { Avatar, Badge, CategoryIcon, EmptyState, Icon, PageHeader, Spinner, StatusBadge, VerifiedBadge } from '../../components/ui'
import { DOCUMENT_STATUS } from '../../lib/constants'
import { formatDate, money } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { useSaved } from './FindStaff'

async function load(id) {
  const staff = must(await supabase.from('staff_profiles').select('*').eq('id', id).maybeSingle())
  if (!staff) return null
  if (!staff.user_id) return { staff, worker: null, skills: [], docs: [], experience: [], reviews: [] }
  const [worker, skills, docs, experience, reviews, profile] = await Promise.all([
    supabase.from('worker_profiles').select('*').eq('user_id', staff.user_id).maybeSingle(),
    supabase.from('worker_skills').select('skill').eq('worker_id', staff.user_id),
    supabase.from('worker_documents').select('name,document_type,status').eq('worker_id', staff.user_id).eq('status', 'verified'),
    supabase.from('worker_experience').select('*').eq('worker_id', staff.user_id).order('start_date', { ascending: false }),
    supabase.from('reviews').select('*').eq('reviewee_id', staff.user_id).order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('avatar_url').eq('id', staff.user_id).maybeSingle(),
  ])
  return { staff, worker: worker.data, avatar: profile.data?.avatar_url, skills: (skills.data || []).map((s) => s.skill), docs: docs.data || [], experience: experience.data || [], reviews: reviews.data || [] }
}

export default function StaffProfile() {
  const { id } = useParams()
  const { session } = useSession()
  const { data, loading, error } = useLoader(() => load(id), [id])
  const { saved, toggle } = useSaved(session.user.id)
  const [booking, setBooking] = useState(false)

  if (loading) return <Workspace role="hirer"><Spinner /></Workspace>
  if (error || !data) return <Workspace role="hirer"><EmptyState icon="UserX" title="Profile unavailable" action={<NavLink to="/hirer/find-staff" className="btn btn-primary">Back to Find staff</NavLink>}>{error?.message || 'This professional is not currently listed.'}</EmptyState></Workspace>

  const { staff, worker, avatar, skills, docs, experience, reviews } = data
  const rate = worker?.daily_rate ? `${money(worker.daily_rate)}/day` : worker?.hourly_rate || staff.hourly_rate ? `${money(worker?.hourly_rate || staff.hourly_rate)}/hr` : null

  return <Workspace role="hirer">
    <PageHeader back={{ to: '/hirer/find-staff', label: 'Find staff' }} title="" />
    <section className="profile-hero card">
      <Avatar name={staff.name} src={avatar} size="xl" />
      <div className="profile-hero-main">
        <div className="row wrap-gap"><h1>{staff.name}</h1>{staff.is_verified ? <VerifiedBadge /> : <Badge tone="warning">Verification pending</Badge>}</div>
        <p className="staff-role lg"><CategoryIcon category={staff.category} size={16} />{staff.category}</p>
        <RatingTag rating={staff.rating} count={staff.review_count} />
        <div className="meta"><span><Icon name="MapPin" size={14} />{[worker?.area, staff.location, staff.state].filter(Boolean).join(', ')}</span><span><Icon name="Briefcase" size={14} />{worker?.years_experience || staff.years_experience || 0} years experience</span>{worker?.languages?.length > 0 && <span><Icon name="Languages" size={14} />{worker.languages.join(', ')}</span>}</div>
      </div>
      <div className="profile-hero-cta">
        {rate && <div className="rate"><span>Typical rate</span><strong>{rate}</strong></div>}
        <button className="btn btn-primary btn-lg" onClick={() => setBooking(true)}><Icon name="CalendarCheck" size={18} />Book {staff.name.split(' ')[0]}</button>
        <button className="btn btn-ghost" onClick={() => toggle(staff)}><Icon name="Heart" size={16} />{saved.has(staff.id) ? 'Saved' : 'Save for later'}</button>
      </div>
    </section>

    <div className="profile-layout">
      <div className="stack">
        <section className="card card-pad">
          <h2 className="card-title">About</h2>
          <p>{staff.bio || staff.summary || 'This professional hasn\'t written a bio yet.'}</p>
          {skills.length > 0 && <div className="chip-row">{skills.map((skill) => <span className="chip static" key={skill}>{skill}</span>)}</div>}
          {worker?.portfolio_url && <a className="link" href={worker.portfolio_url} target="_blank" rel="noreferrer"><Icon name="ExternalLink" size={14} />View portfolio</a>}
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Experience</h2>
          {experience.length ? <ol className="timeline compact">{experience.map((exp) => <li key={exp.id}><span className="timeline-dot" /><div>
            <h3>{exp.title}{exp.employer && <span className="muted"> · {exp.employer}</span>}</h3>
            <span className="muted small">{exp.start_date ? formatDate(exp.start_date, { month: 'short', year: 'numeric' }) : ''}{exp.start_date ? ` – ${exp.is_current ? 'Present' : formatDate(exp.end_date, { month: 'short', year: 'numeric' })}` : ''}</span>
            {exp.description && <p>{exp.description}</p>}
          </div></li>)}</ol> : <p className="muted">No work history listed yet.</p>}
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Ratings & reviews</h2>
          <RatingSummary reviews={reviews} rating={staff.rating} count={staff.review_count} />
          {reviews.length ? <ReviewList reviews={reviews} /> : <p className="muted">No reviews yet. Be the first to book {staff.name.split(' ')[0]}.</p>}
        </section>
      </div>

      <aside className="stack">
        <section className="card card-pad">
          <h2 className="card-title">Verification</h2>
          <ul className="doc-list">
            <li><Icon name="BadgeCheck" size={18} className={staff.is_verified ? 'ok' : ''} /><span>EventStaff NG verified</span><StatusBadge map={{ true: { label: 'Yes', tone: 'success' }, false: { label: 'Pending', tone: 'warning' } }} value={String(!!staff.is_verified)} /></li>
            {docs.map((doc) => <li key={doc.document_type}><Icon name="FileCheck2" size={18} className="ok" /><span>{doc.name}</span><StatusBadge map={DOCUMENT_STATUS} value={doc.status} /></li>)}
          </ul>
          <p className="muted small">Documents are checked by our operations team. File contents are never shared with hirers.</p>
        </section>
        <section className="card card-pad tint">
          <h3><Icon name="Umbrella" size={18} />Booked through EventStaff NG</h3>
          <p className="small">Insurance cover while on the job, payment protection, and a replacement if they cancel.</p>
        </section>
      </aside>
    </div>

    <BookModal open={booking} staff={staff} onClose={() => setBooking(false)} />
  </Workspace>
}
