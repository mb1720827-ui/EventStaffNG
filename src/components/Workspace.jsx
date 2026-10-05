import { useEffect, useState } from 'react'
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useInstallPrompt } from '../lib/pwa'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import NotificationCenter from './NotificationCenter'
import { Logo } from './PublicLayout'
import { Avatar, Icon, Spinner } from './ui'

const NAV = {
  hirer: [
    ['Overview', [['Dashboard', '/hirer/dashboard', 'LayoutDashboard'], ['Post an event', '/hirer/post-event', 'CirclePlus']]],
    ['Hiring', [['My events', '/hirer/events', 'CalendarDays'], ['Find staff', '/hirer/find-staff', 'Search'], ['Bookings', '/hirer/bookings', 'ClipboardCheck'], ['Saved staff', '/hirer/saved', 'Heart']]],
    ['Account', [['Notifications', '/hirer/notifications', 'Bell'], ['Account & plan', '/hirer/settings', 'Building2']]],
  ],
  worker: [
    ['Overview', [['Dashboard', '/worker/dashboard', 'LayoutDashboard']]],
    ['Work', [['Find jobs', '/worker/jobs', 'Search'], ['Applications', '/worker/applications', 'Send'], ['My bookings', '/worker/bookings', 'CalendarCheck'], ['Earnings', '/worker/earnings', 'Wallet']]],
    ['Reputation', [['Ratings & reviews', '/worker/reviews', 'Star'], ['My profile', '/worker/profile', 'UserRound']]],
    ['Account', [['Notifications', '/worker/notifications', 'Bell'], ['Account & security', '/worker/account', 'Settings']]],
  ],
  admin: [
    ['Operations', [['Overview', '/admin', 'LayoutDashboard'], ['Verifications', '/admin/verifications', 'ShieldCheck'], ['Users', '/admin/users', 'Users'], ['Bookings & payouts', '/admin/bookings', 'Banknote'], ['Enquiries', '/admin/enquiries', 'Inbox']]],
  ],
}

// Bottom tab bar on phones, like a native app.
const TABS = {
  hirer: [['Home', '/hirer/dashboard', 'LayoutDashboard'], ['Events', '/hirer/events', 'CalendarDays'], ['Post', '/hirer/post-event', 'CirclePlus'], ['Staff', '/hirer/find-staff', 'Search'], ['Bookings', '/hirer/bookings', 'ClipboardCheck']],
  worker: [['Home', '/worker/dashboard', 'LayoutDashboard'], ['Jobs', '/worker/jobs', 'Search'], ['Bookings', '/worker/bookings', 'CalendarCheck'], ['Earnings', '/worker/earnings', 'Wallet'], ['Profile', '/worker/profile', 'UserRound']],
}

const ROLE_LABEL = { hirer: 'Hirer', worker: 'Professional', admin: 'Admin' }

export function Gate({ role, children }) {
  const { session, profile, initialized } = useSession()
  const location = useLocation()
  if (!initialized) return <div className="screen-center"><Spinner label="Loading your workspace…" /></div>
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  if (!profile) return <div className="screen-center"><Spinner label="Preparing your account…" /></div>
  if (profile.role !== role) return <Navigate to={profile.role === 'admin' ? '/admin' : `/${profile.role}/dashboard`} replace />
  return children
}

// Sends /notifications (used by the installed app's shortcut) to the right inbox.
export function RoleRedirect({ path }) {
  const { session, profile, initialized } = useSession()
  if (!initialized) return <div className="screen-center"><Spinner /></div>
  if (!session || !profile) return <Navigate to="/sign-in" replace />
  return <Navigate to={profile.role === 'admin' ? '/admin' : `/${profile.role}/${path}`} replace />
}

export default function Workspace({ role, children }) {
  const { session, profile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const { available: canInstall, install } = useInstallPrompt()
  useEffect(() => { setDrawer(false) }, [location.pathname])

  const signOut = async () => { await supabase?.auth.signOut(); navigate('/') }
  const home = role === 'admin' ? '/admin' : `/${role}/dashboard`

  return <div className={`ws ${TABS[role] ? 'has-tabs' : ''}`}>
    <aside className={`ws-sidebar ${drawer ? 'open' : ''}`}>
      <div className="ws-sidebar-head"><Logo to={home} light /><button className="icon-btn ghost ws-close" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="X" /></button></div>
      <nav className="ws-nav" aria-label="Workspace">
        {NAV[role].map(([group, links]) => <div key={group} className="ws-nav-group">
          <span className="ws-nav-label">{group}</span>
          {links.map(([label, to, icon]) => <NavLink key={to} to={to} end={to === '/admin'}><Icon name={icon} size={18} /><span>{label}</span></NavLink>)}
        </div>)}
      </nav>
      <div className="ws-sidebar-foot">
        {role === 'hirer' && <NavLink to="/hirer/post-event" className="btn btn-accent btn-block"><Icon name="Plus" size={16} />New event</NavLink>}
        {canInstall && <button className="ws-signout" onClick={install}><Icon name="Download" size={18} />Install the app</button>}
        <button className="ws-signout" onClick={signOut}><Icon name="LogOut" size={18} />Sign out</button>
      </div>
    </aside>
    {drawer && <div className="ws-scrim" onClick={() => setDrawer(false)} />}
    <div className="ws-main">
      <header className="ws-topbar">
        <button className="icon-btn ws-menu" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="Menu" size={22} /></button>
        <span className="ws-topbar-logo"><Logo to={home} /></span>
        <div className="ws-topbar-spacer" />
        {canInstall && <button className="btn btn-secondary btn-sm install-btn" onClick={install}><Icon name="Download" size={15} />Install app</button>}
        {role !== 'admin' && session && <NotificationCenter userId={session.user.id} role={role} />}
        <div className="ws-user">
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
          <div><strong>{profile?.full_name || 'Your account'}</strong><span>{ROLE_LABEL[role]}</span></div>
        </div>
      </header>
      <main className="ws-content">{children}</main>
    </div>
    {TABS[role] && <nav className="tabbar" aria-label="Quick navigation">
      {TABS[role].map(([label, to, icon]) => <NavLink key={to} to={to} className={label === 'Post' ? 'tab-post' : ''}><Icon name={icon} size={label === 'Post' ? 24 : 20} /><span>{label}</span></NavLink>)}
    </nav>}
  </div>
}
