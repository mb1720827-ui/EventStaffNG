import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, Avatar, ChipGroup, Field, Icon, PageHeader, Progress, Spinner, StatusBadge, TagInput } from '../../components/ui'
import { CATEGORIES, CATEGORY_TITLES, DOCUMENT_STATUS, LAUNCH_STATES, STATE_AREAS, WORKER_REGISTRATION_FEE } from '../../lib/constants'
import { money } from '../../lib/format'
import { EVENT_TYPES, WORK_TYPES, requiredDocsFor } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase, uploadFile } from '../../lib/supabase'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const SECTIONS = [
  { key: 'basics', label: 'Basics', icon: 'UserRound', done: (d) => !!(d.fullName && d.phone && d.state && d.area && d.bio.length >= 30) },
  { key: 'profession', label: 'Profession', icon: 'Briefcase', done: (d) => !!(d.profession && d.years !== '') },
  { key: 'experience', label: 'Experience', icon: 'History', done: (d) => d.experience.some((e) => e.title) || Number(d.years) === 0 },
  { key: 'documents', label: 'Verification', icon: 'ShieldCheck', done: (d, docs) => !!d.profession && requiredDocsFor(d.profession).filter((r) => r.required).every((r) => docs.some((doc) => doc.document_type === r.document_type && doc.file_path)) },
  { key: 'preferences', label: 'Job preferences', icon: 'SlidersHorizontal', done: (d) => d.prefCategories.length > 0 && d.prefStates.length > 0 },
  { key: 'availability', label: 'Availability', icon: 'CalendarClock', done: (d) => d.days.length > 0 || d.dates.length > 0 },
  { key: 'rates', label: 'Rates', icon: 'Banknote', done: (d) => !!d.minPay },
]

const blankExperience = () => ({ key: Math.random(), title: '', employer: '', start: '', end: '', current: false, description: '' })

async function loadProfile(userId, profile) {
  const [wp, prefs, skills, exp, docs, avail] = await Promise.all([
    supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('worker_preferences').select('*').eq('worker_id', userId).maybeSingle(),
    supabase.from('worker_skills').select('skill').eq('worker_id', userId),
    supabase.from('worker_experience').select('*').eq('worker_id', userId).order('start_date', { ascending: false }),
    supabase.from('worker_documents').select('*').eq('worker_id', userId),
    supabase.from('worker_availability').select('*').eq('worker_id', userId),
  ])
  const w = wp.data || {}
  const p = prefs.data || {}
  const slots = avail.data || []
  const weekly = slots.filter((s) => s.available_date == null && s.day_of_week != null)
  return {
    data: {
      fullName: profile?.full_name || '', phone: profile?.phone || w.phone || '', avatar: profile?.avatar_url || '',
      state: w.state || profile?.state || LAUNCH_STATES[0], area: w.area || '', address: w.address || '', bio: w.bio || '',
      profession: w.primary_profession || '', years: w.years_experience ?? '', skills: (skills.data || []).map((s) => s.skill),
      languages: w.languages?.length ? w.languages : ['English'], portfolio: w.portfolio_url || '',
      experience: (exp.data || []).map((e) => ({ key: e.id, title: e.title, employer: e.employer || '', start: e.start_date || '', end: e.end_date || '', current: e.is_current, description: e.description || '' })),
      prefCategories: p.preferred_categories || [], prefEventTypes: p.preferred_event_types || [], workTypes: p.work_types || [],
      prefStates: p.preferred_states?.length ? p.preferred_states : (w.state ? [w.state] : []), prefAreas: p.preferred_areas || [], maxTravel: p.max_travel_km ?? '',
      days: [...new Set(weekly.map((s) => s.day_of_week))], dayStart: weekly[0]?.start_time?.slice(0, 5) || p.available_start_time?.slice(0, 5) || '08:00', dayEnd: weekly[0]?.end_time?.slice(0, 5) || p.available_end_time?.slice(0, 5) || '23:00',
      dates: p.available_dates || [],
      minPay: p.minimum_pay ?? w.minimum_rate ?? '', preferredPay: p.preferred_pay ?? w.preferred_rate ?? '', hourly: w.hourly_rate ?? '', daily: w.daily_rate ?? '',
    },
    docs: docs.data || [],
    exists: !!wp.data,
  }
}

export function completionOf(data, docs) {
  return Math.round((SECTIONS.filter((s) => s.done(data, docs)).length / SECTIONS.length) * 100)
}

export default function ProfileBuilder() {
  const { session, profile, refreshProfile } = useSession()
  const navigate = useNavigate()
  const userId = session.user.id
  const [data, setData] = useState(null)
  const [docs, setDocs] = useState([])
  const [section, setSection] = useState('basics')
  const [status, setStatus] = useState({ busy: false, tone: '', text: '' })
  const [uploading, setUploading] = useState('')
  const [dateDraft, setDateDraft] = useState('')
  const avatarInput = useRef(null)

  useEffect(() => {
    loadProfile(userId, profile).then((result) => {
      setData(result.data)
      setDocs(result.docs)
      const firstOpen = SECTIONS.find((s) => !s.done(result.data, result.docs))
      if (firstOpen && result.exists) setSection(firstOpen.key)
    })
    // Only on mount: the profile context refreshes after saves, and we don't want to clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const completion = useMemo(() => (data ? completionOf(data, docs) : 0), [data, docs])
  if (!data) return <Workspace role="worker"><Spinner label="Loading your profile…" /></Workspace>

  const set = (key) => (value) => setData((current) => ({ ...current, [key]: value?.target ? value.target.value : value }))
  const index = SECTIONS.findIndex((s) => s.key === section)

  // Everything references worker_profiles, so it is always written first.
  const saveWorkerProfile = async () => supabase.from('worker_profiles').upsert({
    user_id: userId, phone: data.phone, state: data.state, city: data.state, area: data.area, address: data.address || null, bio: data.bio,
    primary_profession: data.profession || null, years_experience: data.years === '' ? null : Number(data.years),
    languages: data.languages, portfolio_url: data.portfolio || null,
    hourly_rate: data.hourly === '' ? null : Number(data.hourly), daily_rate: data.daily === '' ? null : Number(data.daily),
    minimum_rate: data.minPay === '' ? null : Number(data.minPay), preferred_rate: data.preferredPay === '' ? null : Number(data.preferredPay),
    profile_completion: completion, rate_type: data.daily ? 'day' : data.hourly ? 'hour' : 'event',
  })

  const saveAll = async () => {
    const errors = []
    const push = (res) => res?.error && errors.push(res.error.message)
    push(await supabase.from('profiles').update({ full_name: data.fullName, phone: data.phone, state: data.state, avatar_url: data.avatar || null }).eq('id', userId))
    push(await saveWorkerProfile())
    if (errors.length) return errors

    await supabase.from('worker_skills').delete().eq('worker_id', userId)
    if (data.skills.length) push(await supabase.from('worker_skills').insert(data.skills.map((skill) => ({ worker_id: userId, skill }))))

    await supabase.from('worker_experience').delete().eq('worker_id', userId)
    const exp = data.experience.filter((e) => e.title.trim())
    if (exp.length) push(await supabase.from('worker_experience').insert(exp.map((e) => ({ worker_id: userId, title: e.title, employer: e.employer || null, start_date: e.start || null, end_date: e.current ? null : e.end || null, is_current: e.current, description: e.description || null }))))

    push(await supabase.from('worker_preferences').upsert({
      worker_id: userId, preferred_categories: data.prefCategories, preferred_event_types: data.prefEventTypes, work_types: data.workTypes,
      preferred_states: data.prefStates, preferred_cities: [], preferred_areas: data.prefAreas, max_travel_km: data.maxTravel === '' ? null : Number(data.maxTravel),
      available_dates: data.dates, available_start_time: data.dayStart || null, available_end_time: data.dayEnd || null,
      minimum_pay: data.minPay === '' ? null : Number(data.minPay), preferred_pay: data.preferredPay === '' ? null : Number(data.preferredPay),
      hourly_rate: data.hourly === '' ? null : Number(data.hourly), daily_rate: data.daily === '' ? null : Number(data.daily),
    }))

    await supabase.from('worker_availability').delete().eq('worker_id', userId)
    if (data.days.length) push(await supabase.from('worker_availability').insert(data.days.map((day) => ({ worker_id: userId, day_of_week: day, start_time: data.dayStart || null, end_time: data.dayEnd || null, is_available: true }))))

    // Public marketplace card. Verification flags are admin-controlled (DB trigger).
    if (data.profession) {
      const staffFields = {
        user_id: userId, name: data.fullName, category: data.profession, location: data.area || data.state, state: data.state,
        bio: data.bio, summary: data.bio.slice(0, 160), years_experience: Number(data.years) || 0,
        hourly_rate: data.hourly === '' ? null : Number(data.hourly), is_available: true, match_score: completion,
      }
      const { data: existing } = await supabase.from('staff_profiles').select('id').eq('user_id', userId).maybeSingle()
      push(existing ? await supabase.from('staff_profiles').update(staffFields).eq('id', existing.id) : await supabase.from('staff_profiles').insert(staffFields))
    }
    return errors
  }

  const save = async (next) => {
    setStatus({ busy: true, tone: '', text: '' })
    const errors = await saveAll()
    if (errors.length) return setStatus({ busy: false, tone: 'danger', text: errors[0] })
    refreshProfile()
    if (next === 'finish') return navigate('/worker/profile')
    setStatus({ busy: false, tone: 'success', text: 'Saved.' })
    if (next) { setSection(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }

  const uploadAvatar = async (file) => {
    if (!file) return
    setUploading('avatar')
    const path = `${userId}/avatar-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await uploadFile('avatars', path, file)
    setUploading('')
    if (error) return setStatus({ busy: false, tone: 'danger', text: `Photo upload failed: ${error.message}` })
    setData((current) => ({ ...current, avatar: path }))
  }

  const uploadDocument = async (requirement, file) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) return setStatus({ busy: false, tone: 'danger', text: 'Files must be under 10 MB.' })
    setUploading(requirement.document_type)
    const ensured = await saveWorkerProfile()
    if (ensured.error) { setUploading(''); return setStatus({ busy: false, tone: 'danger', text: ensured.error.message }) }
    const path = `${userId}/${requirement.document_type}-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await uploadFile('documents', path, file)
    if (error) { setUploading(''); return setStatus({ busy: false, tone: 'danger', text: `Upload failed: ${error.message}` }) }
    const existing = docs.find((d) => d.document_type === requirement.document_type)
    const row = { worker_id: userId, category: data.profession, document_type: requirement.document_type, name: requirement.label, file_path: path, status: 'submitted' }
    const result = existing
      ? await supabase.from('worker_documents').update(row).eq('id', existing.id).select().single()
      : await supabase.from('worker_documents').insert(row).select().single()
    setUploading('')
    if (result.error) return setStatus({ busy: false, tone: 'danger', text: result.error.message })
    setDocs((current) => [...current.filter((d) => d.id !== result.data.id), result.data])
    setStatus({ busy: false, tone: 'success', text: `${requirement.label} uploaded — it's now in our review queue.` })
  }

  const updateExp = (key, patch) => set('experience')(data.experience.map((e) => (e.key === key ? { ...e, ...patch } : e)))
  const nextKey = SECTIONS[index + 1]?.key

  return <Workspace role="worker">
    <PageHeader back={{ to: '/worker/profile', label: 'Profile overview' }} eyebrow="Professional profile" title="Build your profile" description="A complete, verified profile ranks higher in matching and appears in hirer search." />

    <div className="builder">
      <aside className="builder-nav card">
        <Progress value={completion} label="Profile strength" />
        <ol>
          {SECTIONS.map((s, i) => {
            const done = s.done(data, docs)
            return <li key={s.key}><button className={`${section === s.key ? 'active' : ''} ${done ? 'done' : ''}`} onClick={() => setSection(s.key)}>
              <span className="builder-dot">{done ? <Icon name="Check" size={13} /> : i + 1}</span>{s.label}
            </button></li>
          })}
        </ol>
      </aside>

      <form className="card card-pad form builder-body" onSubmit={(event) => { event.preventDefault(); save(nextKey || 'finish') }}>
        <h2 className="card-title"><Icon name={SECTIONS[index].icon} size={20} />{SECTIONS[index].label}</h2>

        {section === 'basics' && <>
          <div className="avatar-upload">
            <Avatar name={data.fullName} src={data.avatar} size="xl" />
            <div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => avatarInput.current?.click()} disabled={uploading === 'avatar'}><Icon name="Camera" size={15} />{uploading === 'avatar' ? 'Uploading…' : data.avatar ? 'Change photo' : 'Upload photo'}</button>
              <p className="muted small">A clear, friendly headshot. Profiles with photos get far more bookings.</p>
              <input ref={avatarInput} type="file" accept="image/*" hidden onChange={(event) => uploadAvatar(event.target.files[0])} />
            </div>
          </div>
          <div className="field-row">
            <Field label="Full name" required><input value={data.fullName} onChange={set('fullName')} required /></Field>
            <Field label="Phone number" required><input type="tel" value={data.phone} onChange={set('phone')} required /></Field>
          </div>
          <div className="field-row">
            <Field label="State" required><select value={data.state} onChange={(e) => setData({ ...data, state: e.target.value, area: '' })}>{LAUNCH_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Area you live in" required><input list="home-areas" value={data.area} onChange={set('area')} required /><datalist id="home-areas">{STATE_AREAS[data.state]?.map((a) => <option key={a} value={a} />)}</datalist></Field>
          </div>
          <Field label="Address" hint="Private — only used for travel-distance matching."><input value={data.address} onChange={set('address')} /></Field>
          <Field label="Short bio" required hint={`${data.bio.length}/400 · at least 30 characters. Shown to hirers.`}><textarea rows="4" maxLength={400} value={data.bio} onChange={set('bio')} required minLength={30} placeholder="e.g. Experienced banquet server with 5 years at Abuja's top hotels. Calm under pressure, great with VIP guests." /></Field>
        </>}

        {section === 'profession' && <>
          <Field label="Primary profession" required>
            <div className="choice-grid">
              {CATEGORIES.map((c) => <button type="button" key={c.slug} className={`choice ${data.profession === c.title ? 'active' : ''}`} onClick={() => setData({ ...data, profession: c.title, prefCategories: data.prefCategories.length ? data.prefCategories : [c.title] })}>
                <Icon name={c.icon} size={20} /><span>{c.title}</span>
              </button>)}
            </div>
          </Field>
          <div className="field-row">
            <Field label="Years of experience" required><input type="number" min="0" max="60" value={data.years} onChange={set('years')} required /></Field>
            <Field label="Portfolio / showreel link" hint="Instagram, website, Google Drive…"><input type="url" value={data.portfolio} onChange={set('portfolio')} placeholder="https://" /></Field>
          </div>
          <Field label="Skills & specialities" hint="Press Enter to add."><TagInput value={data.skills} onChange={set('skills')} placeholder="Add a skill…" suggestions={CATEGORIES.find((c) => c.title === data.profession)?.roles || []} /></Field>
          <Field label="Languages"><TagInput value={data.languages} onChange={set('languages')} suggestions={['English', 'Pidgin', 'Hausa', 'Yoruba', 'Igbo', 'French']} /></Field>
        </>}

        {section === 'experience' && <>
          <p className="muted">Add the events, venues or employers you've worked for. New to events? Set years of experience to 0 and skip this.</p>
          {data.experience.map((e) => <div className="sub-card" key={e.key}>
            <div className="field-row">
              <Field label="Role"><input value={e.title} onChange={(ev) => updateExp(e.key, { title: ev.target.value })} placeholder="Head waiter" /></Field>
              <Field label="Employer / client"><input value={e.employer} onChange={(ev) => updateExp(e.key, { employer: ev.target.value })} placeholder="Transcorp Hilton" /></Field>
            </div>
            <div className="field-row">
              <Field label="From"><input type="date" value={e.start} onChange={(ev) => updateExp(e.key, { start: ev.target.value })} /></Field>
              <Field label="To"><input type="date" value={e.end} disabled={e.current} onChange={(ev) => updateExp(e.key, { end: ev.target.value })} /></Field>
            </div>
            <label className="checkbox"><input type="checkbox" checked={e.current} onChange={(ev) => updateExp(e.key, { current: ev.target.checked })} /><span>I currently work here</span></label>
            <Field label="What you did"><textarea rows="2" value={e.description} onChange={(ev) => updateExp(e.key, { description: ev.target.value })} /></Field>
            <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => set('experience')(data.experience.filter((x) => x.key !== e.key))}><Icon name="Trash2" size={14} />Remove</button>
          </div>)}
          <button type="button" className="btn btn-secondary" onClick={() => set('experience')([...data.experience, blankExperience()])}><Icon name="Plus" size={16} />Add experience</button>
        </>}

        {section === 'documents' && <>
          {!data.profession ? <Alert tone="warning">Choose your primary profession first — required documents depend on it. <button type="button" className="link-btn" onClick={() => setSection('profession')}>Go to Profession</button></Alert> : <>
            <p className="muted">Upload clear photos or PDFs. Our verification team reviews each document — you'll be notified of the result. Once approved, you get the <strong>Verified professional</strong> badge and appear in hirer search.</p>
            <ul className="doc-upload-list">
              {requiredDocsFor(data.profession).map((req) => {
                const doc = docs.find((d) => d.document_type === req.document_type)
                return <li key={req.document_type}>
                  <span className={`doc-icon ${doc?.status === 'verified' ? 'ok' : ''}`}><Icon name={doc?.status === 'verified' ? 'FileCheck2' : 'FileText'} size={20} /></span>
                  <div>
                    <strong>{req.label}</strong>{!req.required && <span className="muted small"> · optional</span>}
                    <div className="row wrap-gap">{doc ? <StatusBadge map={DOCUMENT_STATUS} value={doc.status} /> : <span className="muted small">Not uploaded</span>}{doc?.rejection_reason && doc.status === 'rejected' && <span className="danger-text small">{doc.rejection_reason}</span>}</div>
                  </div>
                  {doc?.status !== 'verified' && <label className={`btn btn-sm ${doc ? 'btn-ghost' : 'btn-secondary'} file-btn`}>
                    <Icon name="Upload" size={15} />{uploading === req.document_type ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/*,application/pdf" hidden disabled={!!uploading} onChange={(event) => uploadDocument(req, event.target.files[0])} />
                  </label>}
                </li>
              })}
            </ul>
            <div className="note"><Icon name="Info" size={16} />A one-time {money(WORKER_REGISTRATION_FEE)} registration fee covers verification and onboarding. Our team will contact you about payment during review.</div>
          </>}
        </>}

        {section === 'preferences' && <>
          <Field label="Job categories you'll take" required hint="Your primary profession is usually enough. Add others you're qualified for."><ChipGroup options={CATEGORY_TITLES} value={data.prefCategories} onChange={set('prefCategories')} /></Field>
          <Field label="Event types you enjoy"><ChipGroup options={EVENT_TYPES.filter((t) => t !== 'Other')} value={data.prefEventTypes} onChange={set('prefEventTypes')} /></Field>
          <Field label="States you'll work in" required><ChipGroup options={LAUNCH_STATES} value={data.prefStates} onChange={set('prefStates')} /></Field>
          <Field label="Preferred areas" hint="Leave empty to see jobs anywhere in your states."><TagInput value={data.prefAreas} onChange={set('prefAreas')} placeholder="Add an area…" suggestions={data.prefStates.flatMap((s) => STATE_AREAS[s] || [])} /></Field>
          <Field label="Maximum travel distance (km)"><input type="number" min="0" value={data.maxTravel} onChange={set('maxTravel')} placeholder="25" /></Field>
        </>}

        {section === 'availability' && <>
          <Field label="Days you're usually available"><div className="day-picker">{DAYS.map((day, i) => <button type="button" key={day} className={data.days.includes(i) ? 'active' : ''} aria-pressed={data.days.includes(i)} onClick={() => set('days')(data.days.includes(i) ? data.days.filter((d) => d !== i) : [...data.days, i].sort())}>{day}</button>)}</div></Field>
          <div className="field-row">
            <Field label="From"><input type="time" value={data.dayStart} onChange={set('dayStart')} /></Field>
            <Field label="Until"><input type="time" value={data.dayEnd} onChange={set('dayEnd')} /></Field>
          </div>
          <Field label="Shift types"><ChipGroup options={WORK_TYPES} value={data.workTypes} onChange={set('workTypes')} /></Field>
          <Field label="Specific dates you're free" hint="Adding a date boosts your match for jobs on that day.">
            <div className="row"><input type="date" value={dateDraft} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDateDraft(e.target.value)} /><button type="button" className="btn btn-secondary" disabled={!dateDraft} onClick={() => { set('dates')([...new Set([...data.dates, dateDraft])].sort()); setDateDraft('') }}>Add</button></div>
          </Field>
          {data.dates.length > 0 && <div className="chip-row">{data.dates.map((d) => <span className="tag" key={d}>{new Date(`${d}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}<button type="button" onClick={() => set('dates')(data.dates.filter((x) => x !== d))} aria-label="Remove date"><Icon name="X" size={12} /></button></span>)}</div>}
        </>}

        {section === 'rates' && <>
          <p className="muted">Rates help us match you to jobs that pay what you're worth. You always see the pay before applying.</p>
          <div className="field-row">
            <Field label="Minimum pay per event (₦)" required hint="Jobs below this are ranked lower."><input type="number" min="0" step="500" value={data.minPay} onChange={set('minPay')} required /></Field>
            <Field label="Preferred pay per event (₦)"><input type="number" min="0" step="500" value={data.preferredPay} onChange={set('preferredPay')} /></Field>
          </div>
          <div className="field-row">
            <Field label="Hourly rate (₦)"><input type="number" min="0" step="100" value={data.hourly} onChange={set('hourly')} /></Field>
            <Field label="Day rate (₦)"><input type="number" min="0" step="500" value={data.daily} onChange={set('daily')} /></Field>
          </div>
        </>}

        <Alert tone={status.tone} onClose={() => setStatus({ ...status, text: '' })}>{status.text}</Alert>
        <div className="form-actions">
          {index > 0 ? <button type="button" className="btn btn-ghost" onClick={() => setSection(SECTIONS[index - 1].key)}><Icon name="ArrowLeft" size={16} />Back</button> : <span />}
          <div className="row">
            <button type="button" className="btn btn-secondary" disabled={status.busy} onClick={() => save()}>Save</button>
            <button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Saving…' : nextKey ? 'Save & continue' : 'Save & finish'}{!status.busy && <Icon name="ArrowRight" size={16} />}</button>
          </div>
        </div>
        {completion === 100 && <p className="muted small center-text">Profile complete. <NavLink to="/worker/profile">View your public profile</NavLink></p>}
      </form>
    </div>
  </Workspace>
}
