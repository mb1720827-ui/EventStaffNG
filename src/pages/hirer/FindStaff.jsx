import { useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import BookModal from '../../components/BookModal'
import { RatingTag } from '../../components/Ratings'
import Workspace from '../../components/Workspace'
import { Alert, Avatar, CategoryIcon, EmptyState, Icon, PageHeader, Spinner, VerifiedBadge } from '../../components/ui'
import { CATEGORY_TITLES, LAUNCH_STATES } from '../../lib/constants'
import { money } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

export function useSaved(userId) {
  const { data, reload } = useLoader(async () => new Map(must(await supabase.from('saved_workers').select('id,worker_id').eq('hirer_id', userId)).map((row) => [row.worker_id, row.id])), [userId])
  const saved = data || new Map()
  const toggle = async (staff) => {
    if (saved.has(staff.id)) await supabase.from('saved_workers').delete().eq('id', saved.get(staff.id))
    else await supabase.from('saved_workers').insert({ hirer_id: userId, worker_id: staff.id })
    reload()
  }
  return { saved, toggle }
}

export function StaffCard({ staff, saved, onSave, onBook }) {
  return <article className="staff-card">
    <div className="staff-card-top">
      <Avatar name={staff.name} size="lg" />
      <button className={`icon-btn save ${saved ? 'on' : ''}`} onClick={() => onSave(staff)} aria-label={saved ? 'Remove from saved' : 'Save'} aria-pressed={saved}><Icon name="Heart" size={18} /></button>
    </div>
    <NavLink to={`/hirer/staff/${staff.id}`} className="staff-name">{staff.name}</NavLink>
    <div className="staff-role"><CategoryIcon category={staff.category} size={14} />{staff.category}</div>
    <RatingTag rating={staff.rating} count={staff.review_count} size="sm" />
    <div className="meta"><span><Icon name="MapPin" size={13} />{staff.location}{staff.state ? `, ${staff.state}` : ''}</span></div>
    {staff.is_verified && <VerifiedBadge compact />}
    <p className="staff-summary">{staff.summary || staff.bio || 'Verified EventStaff NG professional.'}</p>
    <div className="staff-foot">
      <span>{staff.years_experience ? `${staff.years_experience} yrs exp.` : 'New'}{staff.hourly_rate ? ` · from ${money(staff.hourly_rate)}/hr` : ''}</span>
    </div>
    <div className="row">
      <NavLink to={`/hirer/staff/${staff.id}`} className="btn btn-ghost btn-sm grow">View profile</NavLink>
      <button className="btn btn-primary btn-sm grow" onClick={() => onBook(staff)}>Book</button>
    </div>
  </article>
}

export default function FindStaff() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') || '')
  const category = params.get('category') || ''
  const state = params.get('state') || ''
  const [sort, setSort] = useState('rating')
  const [booking, setBooking] = useState(null)
  const { saved, toggle } = useSaved(session.user.id)
  const { data, loading, error } = useLoader(async () => must(await supabase.from('staff_profiles').select('*').eq('is_available', true).eq('is_verified', true).not('user_id', 'is', null).order('rating', { ascending: false })), [])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const stateKey = state.toLowerCase().includes('abuja') ? 'abuja' : state.toLowerCase()
    const list = (data || []).filter((staff) => {
      const text = `${staff.name} ${staff.category} ${staff.location} ${staff.state || ''} ${staff.summary || ''}`.toLowerCase()
      return (!q || text.includes(q)) && (!category || staff.category === category)
        && (!state || `${staff.state || ''} ${staff.location}`.toLowerCase().includes(stateKey) || (stateKey === 'abuja' && /fct/i.test(staff.state || '')))
    })
    const sorters = {
      rating: (a, b) => b.rating * Math.min(b.review_count, 5) - a.rating * Math.min(a.review_count, 5) || b.review_count - a.review_count,
      experience: (a, b) => (b.years_experience || 0) - (a.years_experience || 0),
      reviews: (a, b) => b.review_count - a.review_count,
    }
    return list.sort(sorters[sort])
  }, [data, query, category, state, sort])

  return <Workspace role="hirer">
    <PageHeader eyebrow="Marketplace" title="Find verified staff" description="Every professional here has passed EventStaff NG verification." />

    <div className="filter-bar card">
      <div className="search-input"><Icon name="Search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, skill or area…" aria-label="Search staff" /></div>
      <select value={category} onChange={(event) => setFilter('category', event.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORY_TITLES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={state} onChange={(event) => setFilter('state', event.target.value)} aria-label="State"><option value="">All locations</option>{LAUNCH_STATES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort"><option value="rating">Top rated</option><option value="reviews">Most reviewed</option><option value="experience">Most experienced</option></select>
    </div>

    <div className="chip-scroll">
      <button className={`chip ${!category ? 'active' : ''}`} onClick={() => setFilter('category', '')}>All</button>
      {CATEGORY_TITLES.map((item) => <button key={item} className={`chip ${category === item ? 'active' : ''}`} onClick={() => setFilter('category', item)}><CategoryIcon category={item} size={14} />{item}</button>)}
    </div>

    <Alert tone="danger">{error?.message}</Alert>
    {loading ? <Spinner label="Finding professionals…" />
      : <>
        <p className="result-count">{results.length} professional{results.length === 1 ? '' : 's'}{category ? ` in ${category}` : ''}{state ? ` · ${state}` : ''}</p>
        {results.length ? <div className="staff-grid">{results.map((staff) => <StaffCard key={staff.id} staff={staff} saved={saved.has(staff.id)} onSave={toggle} onBook={setBooking} />)}</div>
          : <EmptyState icon="UserSearch" title="No professionals match those filters">Try a different category or location — or post an event and let matched professionals come to you.</EmptyState>}
      </>}

    <BookModal open={!!booking} staff={booking} onClose={() => setBooking(null)} />
  </Workspace>
}
