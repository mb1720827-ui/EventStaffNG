import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { timeAgo } from '../lib/format'
import { showLocalNotification } from '../lib/pwa'
import { supabase } from '../lib/supabase'
import { Icon } from './ui'

export const NOTIFICATION_ICON = { job_match: 'Sparkles', application: 'Send', booking: 'CalendarCheck', payment: 'Wallet', review: 'Star', verification: 'ShieldCheck' }

// Recent notifications + unread count, kept live over Supabase Realtime.
function useNotificationFeed(userId, onArrive) {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const arrive = useRef(onArrive)
  arrive.current = onArrive

  const load = useCallback(async () => {
    if (!supabase || !userId) return
    const [recent, count] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(8),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null),
    ])
    setItems(recent.data || [])
    setUnread(count.count || 0)
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId) return undefined
    load()
    const channel = supabase.channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, ({ new: row }) => {
        setItems((current) => [row, ...current.filter((item) => item.id !== row.id)].slice(0, 8))
        setUnread((n) => n + 1)
        arrive.current?.(row)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, load)
      .subscribe()
    // Reload when the app comes back to the foreground (e.g. reopened from the home screen).
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => { supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onVisible) }
  }, [userId, load])

  const markRead = async (ids) => {
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, read_at: now } : item)))
    setUnread((n) => Math.max(0, n - ids.length))
    await supabase.from('notifications').update({ read_at: now }).in('id', ids)
  }
  const markAll = async () => {
    const now = new Date().toISOString()
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || now })))
    setUnread(0)
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null)
  }
  return { items, unread, markRead, markAll }
}

function Toasts({ toasts, onOpen, onDismiss }) {
  return <div className="toast-stack" aria-live="polite">
    {toasts.map((toast) => <div className="toast" key={toast.id} role="status">
      <span className="notif-icon"><Icon name={NOTIFICATION_ICON[toast.type] || 'Bell'} size={18} /></span>
      <button className="toast-body" onClick={() => onOpen(toast)}><strong>{toast.title}</strong><span>{toast.body}</span></button>
      <button className="icon-btn ghost" onClick={() => onDismiss(toast.id)} aria-label="Dismiss"><Icon name="X" size={16} /></button>
    </div>)}
  </div>
}

export default function NotificationCenter({ userId, role }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState([])
  const panel = useRef(null)

  const dismiss = (id) => setToasts((current) => current.filter((toast) => toast.id !== id))
  const { items, unread, markRead, markAll } = useNotificationFeed(userId, (row) => {
    if (document.visibilityState === 'hidden') showLocalNotification(row)
    setToasts((current) => [row, ...current].slice(0, 3))
    setTimeout(() => dismiss(row.id), 7000)
  })

  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => !panel.current?.contains(event.target) && setOpen(false)
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey) }
  }, [open])

  const openItem = (item) => {
    if (!item.read_at) markRead([item.id])
    dismiss(item.id)
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  return <>
    <div className="bell-wrap" ref={panel}>
      <button className="icon-btn bell" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Icon name="Bell" size={20} />{unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && <div className="bell-panel" role="dialog" aria-label="Notifications">
        <header><strong>Notifications</strong>{unread > 0 && <button className="link-btn" onClick={markAll}>Mark all read</button>}</header>
        {items.length ? <ul>{items.map((item) => <li key={item.id} className={item.read_at ? '' : 'unread'}>
          <button onClick={() => openItem(item)}>
            <span className="notif-icon"><Icon name={NOTIFICATION_ICON[item.type] || 'Bell'} size={16} /></span>
            <div><strong>{item.title}</strong><span>{item.body}</span><small>{timeAgo(item.created_at)}</small></div>
          </button>
        </li>)}</ul> : <p className="muted small pad">You're all caught up.</p>}
        <footer><NavLink to={`/${role}/notifications`}>See all & notification settings</NavLink></footer>
      </div>}
    </div>
    <Toasts toasts={toasts} onOpen={openItem} onDismiss={dismiss} />
  </>
}
