import { useEffect, useState } from 'react'
import { appUrl } from './format'
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const pushConfigured = () => !!VAPID_PUBLIC_KEY
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function registration() {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register(appUrl('sw.js'), { scope: appUrl() })
}

// 'unsupported' | 'unconfigured' | 'denied' | 'enabled' | 'disabled'
export async function pushStatus() {
  if (!pushSupported()) return 'unsupported'
  if (!pushConfigured()) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'enabled' : 'disabled'
}

export async function enablePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' : 'Permission was not granted.')
  const reg = await registration()
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent.slice(0, 200) })
  if (error) throw error
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Show a system notification for an in-app event while the tab is in the
// background (works without the push server, as long as a tab is open).
export async function showLocalNotification(item) {
  if (!pushSupported() || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker.getRegistration()
  const options = { body: item.body, icon: appUrl('icons/icon-192.png'), badge: appUrl('icons/icon-192.png'), tag: item.id, data: { url: item.link || '/' } }
  if (reg) reg.showNotification(item.title, options)
  else new Notification(item.title, options)
}

// "Install app" prompt (Chrome/Edge/Android). iOS installs via Share › Add to Home Screen.
let deferredPrompt = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    listeners.forEach((fn) => fn(true))
  })
  window.addEventListener('appinstalled', () => { deferredPrompt = null; listeners.forEach((fn) => fn(false)) })
}

export function useInstallPrompt() {
  const [available, setAvailable] = useState(!!deferredPrompt)
  useEffect(() => { listeners.add(setAvailable); return () => listeners.delete(setAvailable) }, [])
  const install = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    setAvailable(false)
    return outcome === 'accepted'
  }
  return { available: available && !isStandalone(), install }
}
