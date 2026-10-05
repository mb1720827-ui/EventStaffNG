import { Navigate, NavLink } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Avatar, Badge, CategoryIcon, Icon, PageHeader, Progress, Spinner, Stars, StatusBadge, VerifiedBadge } from '../../components/ui'
import { DOCUMENT_STATUS } from '../../lib/constants'
import { formatDate, money } from '../../lib/format'
import { requiredDocsFor } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { useLoader } from '../../lib/useLoader'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ProfileOverview() {
  const { session, profile } = useSession()
  const userId = session.user.id
  const { data, loading } = useLoader(async () => {
    const [wp, staff, prefs, skills, exp, docs, avail] = await Promise.all([
      supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('staff_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('worker_preferences').select('*').eq('worker_id', userId).maybeSingle(),
      supabase.from('worker_skills').select('skill').eq('worker_id', userId),
      supabase.from('worker_experience').select('*').eq('worker_id', userId).order('start_date', { ascending: false }),
      supabase.from('worker_documents').select('*').eq('worker_id', userId),
      supabase.from('worker_availability').select('day_of_week,start_time,end_time').eq('worker_id', userId),
    ])
    return { wp: wp.data, staff: staff.data, prefs: prefs.data || {}, skills: (skills.data || []).map((s) => s.skill), exp: exp.data || [], docs: docs.data || [], avail: avail.data || [] }
  }, [userId])

  if (loading) return <Workspace role="worker"><Spinner /></Workspace>
  if (!data?.wp) return <Navigate to="/worker/profile/edit" replace />

  const { wp, staff, prefs, skills, exp, docs, avail } = data
  const required = requiredDocsFor(wp.primary_profession)
  const days = [...new Set(avail.map((a) => a.day_of_week).filter((d) => d != null))].sort()
  const verificationState = staff?.is_verified ? 'verified' : docs.some((d) => ['submitted', 'under_review'].includes(d.status)) ? 'review' : 'todo'

  return <Workspace role="worker">
    <PageHeader eyebrow="My profile" title="Your professional profile" actions={<NavLink to="/worker/profile/edit" className="btn btn-primary"><Icon name="Pencil" size={16} />Edit profile</NavLink>} />

    <div className={`verify-banner ${verificationState}`}>
      <span className="verify-icon"><Icon name={{ verified: 'BadgeCheck', review: 'Hourglass', todo: 'ShieldAlert' }[verificationState]} size={22} /></span>
      <div>
        <strong>{{ verified: 'You are an EventStaff NG Verified Professional', review: 'Verification in progress', todo: 'Upload your documents to get verified' }[verificationState]}</strong>
        <p>{{ verified: 'Your profile is visible to hirers in Find Staff.', review: 'Our team is reviewing your documents — usually within 48 hours.', todo: 'Hirers can only find verified professionals in search.' }[verificationState]}</p>
      </div>
      {verificationState === 'todo' && <NavLink to="/worker/profile/edit" className="btn btn-primary">Upload documents</NavLink>}
    </div>

    <div className="profile-layout">
      <div className="stack">
        <section className="profile-hero card">
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size="xl" />
          <div className="profile-hero-main">
            <div className="row wrap-gap"><h1>{profile?.full_name}</h1>{staff?.is_verified && <VerifiedBadge />}</div>
            {wp.primary_profession && <p className="staff-role lg"><CategoryIcon category={wp.primary_profession} size={16} />{wp.primary_profession}</p>}
            <div className="meta"><Stars value={staff?.rating} count={staff?.review_count} /><span><Icon name="MapPin" size={14} />{[wp.area, wp.state].filter(Boolean).join(', ')}</span><span><Icon name="Briefcase" size={14} />{wp.years_experience || 0} yrs</span></div>
            <p>{wp.bio}</p>
            {skills.length > 0 && <div className="chip-row">{skills.map((s) => <span className="chip static" key={s}>{s}</span>)}</div>}
          </div>
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Experience</h2>
          {exp.length ? <ol className="timeline compact">{exp.map((e) => <li key={e.id}><span className="timeline-dot" /><div><h3>{e.title}{e.employer && <span className="muted"> · {e.employer}</span>}</h3><span className="muted small">{e.start_date ? formatDate(e.start_date, { month: 'short', year: 'numeric' }) : ''}{e.start_date ? ` – ${e.is_current ? 'Present' : formatDate(e.end_date, { month: 'short', year: 'numeric' })}` : ''}</span>{e.description && <p>{e.description}</p>}</div></li>)}</ol> : <p className="muted">No experience added. <NavLink to="/worker/profile/edit">Add some</NavLink> to stand out.</p>}
        </section>

        <section className="card card-pad">
          <h2 className="card-title">Preferences & availability</h2>
          <dl className="facts">
            <div><dt>Categories</dt><dd>{prefs.preferred_categories?.join(', ') || '—'}</dd></div>
            <div><dt>Event types</dt><dd>{prefs.preferred_event_types?.join(', ') || 'Any'}</dd></div>
            <div><dt>Locations</dt><dd>{[...(prefs.preferred_states || []), ...(prefs.preferred_areas || [])].join(', ') || '—'}</dd></div>
            <div><dt>Days</dt><dd>{days.length ? days.map((d) => DAYS[d]).join(', ') : '—'}</dd></div>
            <div><dt>Minimum pay</dt><dd>{prefs.minimum_pay ? money(prefs.minimum_pay) : '—'}</dd></div>
            <div><dt>Rates</dt><dd>{[wp.hourly_rate && `${money(wp.hourly_rate)}/hr`, wp.daily_rate && `${money(wp.daily_rate)}/day`].filter(Boolean).join(' · ') || '—'}</dd></div>
          </dl>
        </section>
      </div>

      <aside className="stack">
        <section className="card card-pad">
          <Progress value={wp.profile_completion || 0} label="Profile strength" />
          <p className="muted small">Complete profiles get up to 3× more matches.</p>
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Documents</h2>
          <ul className="doc-list">
            {required.map((req) => {
              const doc = docs.find((d) => d.document_type === req.document_type)
              return <li key={req.document_type}><Icon name={doc?.status === 'verified' ? 'FileCheck2' : 'FileText'} size={18} className={doc?.status === 'verified' ? 'ok' : ''} /><span>{req.label}{!req.required && <em className="muted"> (optional)</em>}</span>{doc ? <StatusBadge map={DOCUMENT_STATUS} value={doc.status} /> : <Badge>Missing</Badge>}</li>
            })}
          </ul>
        </section>
      </aside>
    </div>
  </Workspace>
}
