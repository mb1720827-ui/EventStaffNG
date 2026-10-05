import { useNavigate } from 'react-router-dom'
import { NotificationSettings } from '../components/AccountSettings'
import { NOTIFICATION_ICON } from '../components/NotificationCenter'
import Workspace from '../components/Workspace'
import { Alert, EmptyState, Icon, PageHeader, Spinner } from '../components/ui'
import { timeAgo } from '../lib/format'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { must, useLoader } from '../lib/useLoader'

export default function Notifications({ role }) {
  const { session } = useSession()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useLoader(async () => must(await supabase.from('notifications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(100)), [session])
  const items = data || []
  const unread = items.filter((item) => !item.read_at).length

  const markAll = async () => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', session.user.id).is('read_at', null)
    reload()
  }
  const open = async (item) => {
    if (!item.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', item.id)
    if (item.link) navigate(item.link)
    else reload()
  }
  const clearRead = async () => {
    if (!window.confirm('Delete all read notifications?')) return
    await supabase.from('notifications').delete().eq('user_id', session.user.id).not('read_at', 'is', null)
    reload()
  }

  return <Workspace role={role}>
    <PageHeader eyebrow="Inbox" title="Notifications" description={unread ? `${unread} unread` : 'You\'re all caught up.'}
      actions={<>
        {items.length > unread && <button className="btn btn-ghost" onClick={clearRead}><Icon name="Trash2" size={16} />Clear read</button>}
        {unread > 0 && <button className="btn btn-secondary" onClick={markAll}><Icon name="CheckCheck" size={16} />Mark all as read</button>}
      </>} />
    <Alert tone="danger">{error?.message}</Alert>
    <div className="notif-layout">
      <div>
        {loading && !data ? <Spinner /> : items.length ? <ul className="notif-list card">
          {items.map((item) => <li key={item.id} className={item.read_at ? '' : 'unread'}>
            <button onClick={() => open(item)}>
              <span className="notif-icon"><Icon name={NOTIFICATION_ICON[item.type] || 'Bell'} size={18} /></span>
              <div><strong>{item.title}</strong><p>{item.body}</p><span className="muted small">{timeAgo(item.created_at)}</span></div>
              {!item.read_at && <span className="unread-dot" aria-label="Unread" />}
            </button>
          </li>)}
        </ul> : <EmptyState icon="BellOff" title="No notifications yet">{role === 'worker' ? 'We\'ll alert you when jobs matching your profile are posted, and when hirers respond.' : 'We\'ll alert you when professionals apply and confirm bookings.'}</EmptyState>}
      </div>
      <aside><NotificationSettings /></aside>
    </div>
  </Workspace>
}
