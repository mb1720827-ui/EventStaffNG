// Delivers a Web Push for each new row in public.notifications.
//
// Triggered by a Database Webhook (Database › Webhooks) on INSERT into
// public.notifications, pointing at this function. Required secrets:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:hello@eventstaff.ng)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@eventstaff.ng',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => null)
  const record = payload?.record
  if (payload?.type !== 'INSERT' || !record?.user_id) return new Response('ignored', { status: 200 })

  const { data: subs, error } = await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', record.user_id)
  if (error) return new Response(error.message, { status: 500 })

  const message = JSON.stringify({
    title: record.title,
    body: record.body,
    url: record.link || '/',
    tag: record.id,
    type: record.type,
  })

  const expired: string[] = []
  await Promise.all((subs ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message, { TTL: 60 * 60 * 24 })
    } catch (err) {
      // 404/410 mean the browser revoked the subscription.
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) expired.push(sub.id)
      else console.error('push failed', status, err)
    }
  }))
  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired)

  return new Response(JSON.stringify({ sent: (subs?.length ?? 0) - expired.length, expired: expired.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
