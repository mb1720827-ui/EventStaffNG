import { useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../../components/PublicLayout'
import { Alert, Field, Icon } from '../../components/ui'
import { LAUNCH_STATES } from '../../lib/constants'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'

const INTENT_KEY = 'eventstaff_intent'
const INTENT_PARAMS = ['type', 'guests', 'category', 'date', 'state']

// Remember what the visitor was trying to do (e.g. "Use this plan") so we can
// resume it after sign-up — even across an email-confirmation round trip.
function saveIntent(params) {
  const intent = Object.fromEntries(INTENT_PARAMS.filter((key) => params.get(key)).map((key) => [key, params.get(key)]))
  try { if (Object.keys(intent).length) localStorage.setItem(INTENT_KEY, JSON.stringify(intent)) } catch { /* storage unavailable */ }
}

function takeIntent() {
  try {
    const raw = localStorage.getItem(INTENT_KEY)
    localStorage.removeItem(INTENT_KEY)
    return raw ? new URLSearchParams(JSON.parse(raw)).toString() : ''
  } catch { return '' }
}

function destinationFor(role, intent) {
  if (role === 'admin') return '/admin'
  if (role === 'worker') return '/worker/dashboard'
  return intent ? `/hirer/post-event?${intent}` : '/hirer/dashboard'
}

function AuthShell({ children, aside }) {
  return <div className="auth">
    <div className="auth-panel">
      <div className="auth-top"><Logo /><NavLink to="/" className="back-link"><Icon name="ArrowLeft" size={16} />Back to site</NavLink></div>
      <div className="auth-body">{children}</div>
    </div>
    <aside className="auth-aside">{aside}</aside>
  </div>
}

function AsideCopy({ role }) {
  const points = role === 'worker'
    ? [['BriefcaseBusiness', 'Jobs matched to your profession, area and schedule'], ['BadgeCheck', 'A verified badge that wins you more bookings'], ['Wallet', 'Keep 100% of your agreed rate'], ['Star', 'Build a public rating with every event']]
    : [['Sparkles', 'AI staffing plan for your event in seconds'], ['ShieldCheck', 'Only ID-verified professionals'], ['Users', 'Compare applicants by match score and rating'], ['Umbrella', 'Insured bookings with payment protection']]
  return <div className="auth-aside-inner">
    <span className="eyebrow light">{role === 'worker' ? 'For event professionals' : 'For hirers'}</span>
    <h2>{role === 'worker' ? 'Your skills deserve steady work.' : 'Staff your next event with confidence.'}</h2>
    <ul>{points.map(([icon, text]) => <li key={text}><Icon name={icon} size={18} />{text}</li>)}</ul>
  </div>
}

export function GetStarted() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const preset = params.get('role')
  const go = (role) => {
    const next = new URLSearchParams(params)
    next.set('role', role)
    navigate(`/sign-up?${next}`)
  }
  return <AuthShell aside={<AsideCopy role={preset === 'worker' ? 'worker' : 'hirer'} />}>
    <h1>How will you use EventStaff NG?</h1>
    <p className="muted">Pick one — this sets up the right tools for you.</p>
    <div className="role-cards">
      <button className={`role-card ${preset === 'hirer' ? 'suggested' : ''}`} onClick={() => go('hirer')}>
        <span className="role-icon"><Icon name="Building2" size={24} /></span>
        <div><strong>I want to hire staff</strong><span>Event planners, corporates, government, families and hospitality businesses.</span></div>
        <Icon name="ChevronRight" size={20} />
      </button>
      <button className={`role-card ${preset === 'worker' ? 'suggested' : ''}`} onClick={() => go('worker')}>
        <span className="role-icon accent"><Icon name="UserRound" size={24} /></span>
        <div><strong>I want to work events</strong><span>Chefs, servers, security, MCs, cleaners, photographers, chauffeurs and ushers.</span></div>
        <Icon name="ChevronRight" size={20} />
      </button>
    </div>
    <p className="auth-switch">Already have an account? <NavLink to="/sign-in">Sign in</NavLink></p>
  </AuthShell>
}

export function SignUp() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshProfile } = useSession()
  const role = params.get('role') === 'worker' ? 'worker' : 'hirer'
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', password: '', state: params.get('state') || LAUNCH_STATES[0], agree: false })
  const [status, setStatus] = useState({ busy: false, error: '', info: '' })
  const change = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) return setStatus({ busy: false, error: 'Supabase is not configured for this environment.', info: '' })
    setStatus({ busy: true, error: '', info: '' })
    saveIntent(params)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName, phone: form.phone, role, state: form.state }, emailRedirectTo: `${window.location.origin}/sign-in` },
    })
    if (error) return setStatus({ busy: false, error: error.message, info: '' })
    if (!data.session) return setStatus({ busy: false, error: '', info: `Almost there — we sent a confirmation link to ${form.email}. Open it, then sign in.` })
    await supabase.from('profiles').upsert({ id: data.user.id, full_name: form.fullName, phone: form.phone, role, state: form.state })
    await refreshProfile()
    navigate(role === 'worker' ? '/worker/profile' : destinationFor('hirer', takeIntent()), { replace: true })
  }

  return <AuthShell aside={<AsideCopy role={role} />}>
    <span className="eyebrow">{role === 'worker' ? 'Join as a professional' : 'Create a hirer account'}</span>
    <h1>{role === 'worker' ? 'Start getting event work' : 'Start hiring verified staff'}</h1>
    <p className="muted">Wrong account type? <NavLink to={`/sign-up?role=${role === 'worker' ? 'hirer' : 'worker'}`}>{role === 'worker' ? 'I want to hire instead' : 'I want to work instead'}</NavLink></p>
    <form className="form" onSubmit={submit}>
      <Field label={role === 'hirer' ? 'Your full name' : 'Full name'} required><input value={form.fullName} onChange={change('fullName')} required autoComplete="name" /></Field>
      <div className="field-row">
        <Field label="Phone number" required><input type="tel" value={form.phone} onChange={change('phone')} required autoComplete="tel" placeholder="0803 000 0000" /></Field>
        <Field label="State" required><select value={form.state} onChange={change('state')}>{LAUNCH_STATES.map((item) => <option key={item}>{item}</option>)}</select></Field>
      </div>
      <Field label="Email" required><input type="email" value={form.email} onChange={change('email')} required autoComplete="email" /></Field>
      <Field label="Password" hint="At least 8 characters." required><input type="password" minLength="8" value={form.password} onChange={change('password')} required autoComplete="new-password" /></Field>
      <label className="checkbox"><input type="checkbox" checked={form.agree} onChange={change('agree')} required /><span>I agree to the EventStaff NG terms of service and privacy policy.</span></label>
      <Alert tone="danger">{status.error}</Alert>
      <Alert tone="success">{status.info}</Alert>
      <button className="btn btn-primary btn-lg btn-block" disabled={status.busy}>{status.busy ? 'Creating account…' : 'Create account'}</button>
    </form>
    <p className="auth-switch">Already have an account? <NavLink to="/sign-in">Sign in</NavLink></p>
  </AuthShell>
}

export function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshProfile } = useSession()
  const [form, setForm] = useState({ email: '', password: '' })
  const [status, setStatus] = useState({ busy: false, error: '', info: '' })

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) return setStatus({ busy: false, error: 'Supabase is not configured for this environment.', info: '' })
    setStatus({ busy: true, error: '', info: '' })
    const { data, error } = await supabase.auth.signInWithPassword(form)
    if (error) return setStatus({ busy: false, error: error.message === 'Invalid login credentials' ? 'That email and password don\'t match an account.' : error.message, info: '' })
    let { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    if (!profile) {
      const meta = data.user.user_metadata || {}
      const created = await supabase.from('profiles').upsert({ id: data.user.id, full_name: meta.full_name || data.user.email.split('@')[0], phone: meta.phone || null, role: meta.role === 'worker' ? 'worker' : 'hirer', state: meta.state || null }).select('role').single()
      if (created.error) return setStatus({ busy: false, error: `Signed in, but your profile couldn't be loaded: ${created.error.message}`, info: '' })
      profile = created.data
    }
    await refreshProfile()
    const from = location.state?.from
    navigate(from && from.startsWith(`/${profile.role}`) ? from : destinationFor(profile.role, takeIntent()), { replace: true })
  }

  const reset = async () => {
    if (!form.email) return setStatus({ busy: false, error: 'Enter your email first, then click "Forgot password".', info: '' })
    const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: `${window.location.origin}/reset-password` })
    setStatus({ busy: false, error: error?.message || '', info: error ? '' : `Password reset link sent to ${form.email}.` })
  }

  return <AuthShell aside={<AsideCopy role="hirer" />}>
    <span className="eyebrow">Welcome back</span>
    <h1>Sign in to EventStaff NG</h1>
    <form className="form" onSubmit={submit}>
      <Field label="Email"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></Field>
      <Field label="Password"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required autoComplete="current-password" /></Field>
      <button type="button" className="link-btn" onClick={reset}>Forgot password?</button>
      <Alert tone="danger">{status.error}</Alert>
      <Alert tone="success">{status.info}</Alert>
      <button className="btn btn-primary btn-lg btn-block" disabled={status.busy}>{status.busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="auth-switch">New to EventStaff NG? <NavLink to="/get-started">Create an account</NavLink></p>
  </AuthShell>
}

// Landing page for the "reset your password" email link. Supabase signs the
// visitor in from the link; here they choose the new password.
export function ResetPassword() {
  const navigate = useNavigate()
  const { session, profile, initialized } = useSession()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [status, setStatus] = useState({ busy: false, error: '', done: false })

  const submit = async (event) => {
    event.preventDefault()
    if (form.password !== form.confirm) return setStatus({ busy: false, error: 'The passwords don\'t match.', done: false })
    setStatus({ busy: true, error: '', done: false })
    const { error } = await supabase.auth.updateUser({ password: form.password })
    if (error) return setStatus({ busy: false, error: error.message, done: false })
    setStatus({ busy: false, error: '', done: true })
    setTimeout(() => navigate(destinationFor(profile?.role || 'hirer', ''), { replace: true }), 1500)
  }

  return <AuthShell aside={<AsideCopy role={profile?.role === 'worker' ? 'worker' : 'hirer'} />}>
    <span className="eyebrow">Account recovery</span>
    <h1>Choose a new password</h1>
    {!initialized ? <p className="muted">Checking your reset link…</p>
      : !session ? <>
        <Alert tone="warning">This reset link is invalid or has expired. Request a new one from the sign-in page.</Alert>
        <NavLink to="/sign-in" className="btn btn-primary btn-block">Back to sign in</NavLink>
      </>
      : status.done ? <Alert tone="success">Password updated — taking you to your dashboard…</Alert>
      : <form className="form" onSubmit={submit}>
        <p className="muted">For {session.user.email}</p>
        <Field label="New password" hint="At least 8 characters."><input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" /></Field>
        <Field label="Confirm new password"><input type="password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required autoComplete="new-password" /></Field>
        <Alert tone="danger">{status.error}</Alert>
        <button className="btn btn-primary btn-lg btn-block" disabled={status.busy}>{status.busy ? 'Saving…' : 'Save new password'}</button>
      </form>}
  </AuthShell>
}
