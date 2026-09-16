import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function WorkerProfileV2({ session, profile, Workspace }) {
  const [form, setForm] = useState({ bio: '', city: '', preferredCategories: 'Servers', preferredStates: 'Abuja', minimumPay: '' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('worker_preferences').select('*').eq('worker_id', session.user.id).maybeSingle(),
    ]).then(([profileResult, preferenceResult]) => {
      const worker = profileResult.data || {}
      const preferences = preferenceResult.data || {}
      setForm({ bio: worker.bio || '', city: worker.city || '', preferredCategories: (preferences.preferred_categories || []).join(', '), preferredStates: (preferences.preferred_states || []).join(', '), minimumPay: preferences.minimum_pay || '' })
    })
  }, [session])

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    const { error: profileError } = await supabase.from('worker_profiles').upsert({ user_id: session.user.id, bio: form.bio, city: form.city, profile_completion: 65 })
    const { error: preferenceError } = await supabase.from('worker_preferences').upsert({ worker_id: session.user.id, preferred_categories: form.preferredCategories.split(',').map((item) => item.trim()).filter(Boolean), preferred_states: form.preferredStates.split(',').map((item) => item.trim()).filter(Boolean), minimum_pay: Number(form.minimumPay || 0) })
    setBusy(false)
    setMessage(profileError?.message || preferenceError?.message || 'Professional profile and job preferences saved.')
  }

  return <Workspace role="worker"><section className="page-heading"><span className="eyebrow">Professional profile</span><h2>{profile?.full_name || 'Your profile'}</h2><p>These details improve your marketplace recommendations without restricting job discovery.</p></section><form className="event-form wide-form" onSubmit={save}><label>Professional bio<textarea rows="4" value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label><div className="two-col"><label>City<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label><label>Preferred categories<input value={form.preferredCategories} onChange={(event) => setForm({ ...form, preferredCategories: event.target.value })} placeholder="Servers, Ushers" /></label></div><div className="two-col"><label>Preferred states<input value={form.preferredStates} onChange={(event) => setForm({ ...form, preferredStates: event.target.value })} placeholder="Abuja, Lagos" /></label><label>Minimum acceptable pay<input type="number" min="0" value={form.minimumPay} onChange={(event) => setForm({ ...form, minimumPay: event.target.value })} /></label></div><button className="primary-btn" disabled={busy}>{busy ? 'Saving...' : 'Save professional preferences'}</button>{message && <p className="form-message">{message}</p>}</form></Workspace>
}
