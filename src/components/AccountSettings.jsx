import { useEffect, useState } from 'react'
import { disablePush, enablePush, isIos, isStandalone, pushStatus, useInstallPrompt } from '../lib/pwa'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Alert, Field, Icon } from './ui'

export function ChangePassword() {
  const { session } = useSession()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [status, setStatus] = useState({ busy: false, tone: '', text: '' })
  const submit = async (event) => {
    event.preventDefault()
    if (form.next !== form.confirm) return setStatus({ busy: false, tone: 'danger', text: 'The new passwords don\'t match.' })
    setStatus({ busy: true, tone: '', text: '' })
    // Re-check the current password so an unattended, signed-in device can't be taken over.
    const check = await supabase.auth.signInWithPassword({ email: session.user.email, password: form.current })
    if (check.error) return setStatus({ busy: false, tone: 'danger', text: 'Your current password is incorrect.' })
    const { error } = await supabase.auth.updateUser({ password: form.next })
    setStatus({ busy: false, tone: error ? 'danger' : 'success', text: error ? error.message : 'Password updated.' })
    if (!error) setForm({ current: '', next: '', confirm: '' })
  }
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })
  return <form className="card card-pad form" onSubmit={submit}>
    <h2 className="card-title"><Icon name="KeyRound" size={20} />Password</h2>
    <p className="muted small">Signed in as {session?.user?.email}</p>
    <Field label="Current password"><input type="password" value={form.current} onChange={set('current')} required autoComplete="current-password" /></Field>
    <div className="field-row">
      <Field label="New password" hint="At least 8 characters."><input type="password" minLength={8} value={form.next} onChange={set('next')} required autoComplete="new-password" /></Field>
      <Field label="Confirm new password"><input type="password" minLength={8} value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" /></Field>
    </div>
    <Alert tone={status.tone}>{status.text}</Alert>
    <div className="form-actions"><span /><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Updating…' : 'Update password'}</button></div>
  </form>
}

const STATUS_COPY = {
  unsupported: 'This browser doesn\'t support push notifications. You\'ll still get in-app alerts while EventStaff NG is open.',
  unconfigured: 'Push delivery isn\'t set up on this deployment yet (missing VAPID key). In-app alerts still work.',
  denied: 'Notifications are blocked for this site. Allow them in your browser\'s site settings, then come back here.',
  enabled: 'This device will receive notifications even when EventStaff NG is closed.',
  disabled: 'Get alerts for new jobs, applicants, bookings and payouts on this device — even when the app is closed.',
}

export function NotificationSettings() {
  const [status, setStatus] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { available: canInstall, install } = useInstallPrompt()
  useEffect(() => { pushStatus().then(setStatus) }, [])

  const toggle = async () => {
    setBusy(true)
    setError('')
    try {
      if (status === 'enabled') await disablePush()
      else await enablePush()
    } catch (err) {
      setError(err.message || 'Could not change notification settings.')
    }
    setStatus(await pushStatus())
    setBusy(false)
  }

  const iosNeedsInstall = isIos() && !isStandalone()
  return <section className="card card-pad stack">
    <h2 className="card-title"><Icon name="BellRing" size={20} />Notifications on this device</h2>
    <div className="setting-row">
      <div><strong>Push notifications</strong><p className="muted small">{status === 'loading' ? 'Checking…' : STATUS_COPY[status]}</p></div>
      {['enabled', 'disabled'].includes(status) && <button className={`switch ${status === 'enabled' ? 'on' : ''}`} role="switch" aria-checked={status === 'enabled'} disabled={busy} onClick={toggle}><span /></button>}
    </div>
    <div className="setting-row">
      <div><strong>In-app alerts</strong><p className="muted small">Pop-up alerts and the bell badge update instantly while EventStaff NG is open. Always on.</p></div>
      <span className="badge badge-success">On</span>
    </div>
    {iosNeedsInstall && <Alert tone="info">On iPhone and iPad, push notifications work once you add EventStaff NG to your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open it from there.</Alert>}
    {canInstall && <div className="setting-row">
      <div><strong>Install the app</strong><p className="muted small">Add EventStaff NG to your home screen or desktop for one-tap access.</p></div>
      <button className="btn btn-secondary btn-sm" onClick={install}><Icon name="Download" size={15} />Install</button>
    </div>}
    <Alert tone="danger">{error}</Alert>
  </section>
}
