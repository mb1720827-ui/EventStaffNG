import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'

export default function WorkerNotificationsV2({ session, Workspace }) {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      setNotifications(error ? [] : (data || []))
      setLoading(false)
    }
    load()
  }, [session])

  const markRead = async (id) => {
    setMarking(true)
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', session.user.id)
    if (!error) setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setMarking(false)
  }

  const markAllRead = async () => {
    setMarking(true)
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false)
    if (!error) setNotifications((current) => current.map((n) => ({ ...n, read: true })))
    setMarking(false)
  }

  if (!session) return null

  return <Workspace role="worker">
    <section className="page-heading">
      <span className="eyebrow">Notifications</span>
      <h2>Your notifications</h2>
      <p>Updates about matching jobs, applications, and bookings based on your professional profile.</p>
    </section>

    {notifications.length ? (
      <>
        <div className="dashboard-head"><div><span className="mini-label">{notifications.filter((n) => !n.read).length} unread</span></div><button className="secondary-btn small" onClick={markAllRead} disabled={marking || notifications.every((n) => n.read)}>Mark all read</button></div>
        <div className="list-panel">
          {notifications.map((item) => (
            <div className="list-row" key={item.id}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <small>{new Date(item.created_at).toLocaleDateString()}</small>
              </span>
              {!item.read && <button className="secondary-btn small" onClick={() => markRead(item.id)} disabled={marking}>Mark read</button>}
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="empty-state">You have no notifications yet. Apply to jobs to receive updates.</div>
    )}

    <div className="action-stack">
      <NavLink to="/worker/jobs" className="primary-btn">Browse recommended jobs</NavLink>
    </div>
  </Workspace>
}
