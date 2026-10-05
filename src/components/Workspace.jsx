import { useEffect, useState } from 'react'
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { Logo } from './PublicLayout'
import { Avatar, Icon, Spinner } from './ui'

const NAV = {
  hirer: [
    ['Overview', [['Dashboard', '/hirer/dashboard', 'LayoutDashboard'], ['Post an event', '/hirer/post-event', 'CirclePlus']]],
    ['Hiring', [['My events', '/hirer/events', 'CalendarDays'], ['Find staff', '/hirer/find-staff', 'Search'], ['Bookings', '/hirer/bookings', 'ClipboardCheck'], ['Saved staff', '/hirer/saved', 'Heart']]],
    ['Account', [['Notifications', '/hirer/notifications', 'Bell'], ['Organisation & plan', '/hirer/settings', 'Building2']]],
  ],
  worker: [
    ['Overview', [['Dashboard', '/worker/dashboard', 'LayoutDashboard']]],
    ['Work', [['Find jobs', '/worker/jobs', 'Search'], ['Applications', '/worker/applications', 'Send'], ['My bookings', '/worker/bookings', 'CalendarCheck'], ['Earnings', '/worker/earnings', 'Wallet']]],
    ['Account', [['Notifications', '/worker/notifications', 'Bell'], ['My profile', '/worker/profile', 'UserRound']]],
  ],
  admin: [
    ['Operations', [['Overview', '/admin', 'LayoutDashboard'], ['Verifications', '/admin/verifications', 'ShieldCheck'], ['Users', '/admin/users', 'Users'], ['Bookings & payouts', '/admin/bookings', 'Banknote'], ['Enquiries', '/admin/enquiries', 'Inbox']]],
  ],
}

const ROLE_LABEL = { hirer: 'Hirer', worker: 'Professional', admin: 'Admin' }

function useUnreadCount(userId) {
  const [count, setCount] = useState(0)
  const location = useLocation()
  useEffect(() => {
    if (!supabase || !userId) return undefined
    let active = true
    const load = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
      .then(({ count: total }) => active && setCount(total || 0))
    load()
    const channel = supabase.channel(`notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [userId, location.pathname])
  return count
}

export function Gate({ role, children }) {
  const { session, profile, initialized } = useSession()
  if (!initialized) return <div className="screen-center"><Spinner label="Loading your workspace…" /></div>
  if (!session) return <Navigate to="/sign-in" replace state={{ from: window.location.pathname }} />
  if (!profile) return <div className="screen-center"><Spinner label="Preparing your account…" /></div>
  if (profile.role !== role) return <Navigate to={profile.role === 'admin' ? '/admin' : `/${profile.role}/dashboard`} replace />
  return children
}

export default function Workspace({ role, children }) {
  const { session, profile } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)
  const unread = useUnreadCount(session?.user?.id)
  useEffect(() => { setDrawer(false) }, [location.pathname])

  const signOut = async () => { await supabase?.auth.signOut(); navigate('/') }
  const home = role === 'admin' ? '/admin' : `/${role}/dashboard`

  return <div className="ws">
    <aside className={`ws-sidebar ${drawer ? 'open' : ''}`}>
      <div className="ws-sidebar-head"><Logo to={home} light /><button className="icon-btn ghost ws-close" onClick={() => setDrawer(false)} aria-label="Close menu"><Icon name="X" /></button></div>
      <nav className="ws-nav" aria-label="Workspace">
        {NAV[role].map(([group, links]) => <div key={group} className="ws-nav-group">
          <span className="ws-nav-label">{group}</span>
          {links.map(([label, to, icon]) => <NavLink key={to} to={to} end={to === '/admin'}>
            <Icon name={icon} size={18} /><span>{label}</span>
            {label === 'Notifications' && unread > 0 && <span className="nav-count">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>)}
        </div>)}
      </nav>
      <div className="ws-sidebar-foot">
        {role === 'hirer' && <NavLink to="/hirer/post-event" className="btn btn-accent btn-block"><Icon name="Plus" size={16} />New event</NavLink>}
        <button className="ws-signout" onClick={signOut}><Icon name="LogOut" size={18} />Sign out</button>
      </div>
    </aside>
    {drawer && <div className="ws-scrim" onClick={() => setDrawer(false)} />}
    <div className="ws-main">
      <header className="ws-topbar">
        <button className="icon-btn ws-menu" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="Menu" size={22} /></button>
        <div className="ws-topbar-spacer" />
        {role !== 'admin' && <NavLink to={`/${role}/notifications`} className="icon-btn bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Icon name="Bell" size={20} />{unread > 0 && <span className="bell-dot" />}
        </NavLink>}
        <div className="ws-user">
          <Avatar name={profile?.full_name} src={profile?.avatar_url} size="sm" />
          <div><strong>{profile?.full_name || 'Your account'}</strong><span>{ROLE_LABEL[role]}</span></div>
        </div>
      </header>
      <main className="ws-content">{children}</main>
    </div>
  </div>
}
