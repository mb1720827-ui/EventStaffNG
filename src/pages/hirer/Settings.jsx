import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, Badge, Field, Icon, PageHeader, Spinner } from '../../components/ui'
import { HIRER_PLANS, LAUNCH_STATES, ORGANIZATION_TYPES, STATE_AREAS } from '../../lib/constants'
import { money } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'

export default function Settings() {
  const { session, profile, refreshProfile } = useSession()
  const [form, setForm] = useState(null)
  const [plan, setPlan] = useState('payg')
  const [status, setStatus] = useState({ busy: false, tone: '', text: '' })

  useEffect(() => {
    supabase.from('hirer_profiles').select('*').eq('user_id', session.user.id).maybeSingle().then(({ data }) => {
      setPlan(data?.plan || 'payg')
      setForm({
        fullName: profile?.full_name || '', phone: profile?.phone || '', state: profile?.state || LAUNCH_STATES[0],
        organizationName: data?.organization_name || '', organizationType: data?.organization_type || 'Individual',
        area: data?.area || '', address: data?.address || '', about: data?.about || '',
      })
    })
  }, [session, profile])

  if (!form) return <Workspace role="hirer"><Spinner /></Workspace>
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  const current = HIRER_PLANS.find((item) => item.id === plan) || HIRER_PLANS[0]

  const save = async (event) => {
    event.preventDefault()
    setStatus({ busy: true, tone: '', text: '' })
    const [a, b] = await Promise.all([
      supabase.from('profiles').update({ full_name: form.fullName, phone: form.phone, state: form.state }).eq('id', session.user.id),
      supabase.from('hirer_profiles').upsert({ user_id: session.user.id, organization_name: form.organizationName || null, organization_type: form.organizationType, city: form.state, area: form.area || null, address: form.address || null, about: form.about || null }),
    ])
    const error = a.error || b.error
    setStatus({ busy: false, tone: error ? 'danger' : 'success', text: error ? error.message : 'Saved.' })
    if (!error) refreshProfile()
  }

  return <Workspace role="hirer">
    <PageHeader eyebrow="Account" title="Organisation & plan" />
    <div className="profile-layout">
      <form className="card card-pad form" onSubmit={save}>
        <h2 className="card-title">Your details</h2>
        <div className="field-row">
          <Field label="Your name" required><input value={form.fullName} onChange={set('fullName')} required /></Field>
          <Field label="Phone" required><input type="tel" value={form.phone} onChange={set('phone')} required /></Field>
        </div>
        <h2 className="card-title">Organisation</h2>
        <div className="field-row">
          <Field label="Organisation name" hint="Leave blank if you're hiring personally."><input value={form.organizationName} onChange={set('organizationName')} placeholder="e.g. Bloom Events Ltd" /></Field>
          <Field label="Type"><select value={form.organizationType} onChange={set('organizationType')}>{ORGANIZATION_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        <div className="field-row">
          <Field label="State"><select value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value, area: '' })}>{LAUNCH_STATES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Area"><input list="settings-areas" value={form.area} onChange={set('area')} /><datalist id="settings-areas">{(STATE_AREAS[form.state] || []).map((item) => <option key={item} value={item} />)}</datalist></Field>
        </div>
        <Field label="Address"><input value={form.address} onChange={set('address')} /></Field>
        <Field label="About" hint="Helps professionals know who they'll be working for."><textarea rows="3" value={form.about} onChange={set('about')} /></Field>
        <Alert tone={status.tone}>{status.text}</Alert>
        <div className="form-actions"><span /><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>
      <aside className="stack">
        <section className="card card-pad">
          <div className="row between"><h2 className="card-title">Current plan</h2><Badge tone="brand">{current.name}</Badge></div>
          <div className="plan-price sm">{current.price === null ? 'Custom' : current.price === 0 ? 'Free' : money(current.price)}<span>{current.period}</span></div>
          <ul className="checklist">{current.features.map((feature) => <li key={feature}><Icon name="Check" size={15} />{feature}</li>)}</ul>
          {plan !== 'corporate' && <NavLink to={`/contact?topic=${plan === 'payg' ? 'Planner%20Pro' : 'Corporate%20retainer'}`} className="btn btn-accent btn-block">{plan === 'payg' ? 'Upgrade to Planner Pro' : 'Ask about a corporate retainer'}</NavLink>}
          <NavLink to="/pricing" className="link small">Compare plans</NavLink>
        </section>
      </aside>
    </div>
  </Workspace>
}
