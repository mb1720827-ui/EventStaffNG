import { supabase } from './supabase'
import { isWorkerVerified } from './matching'

// Load everything the matching engine needs to know about a worker.
export async function loadWorkerContext(userId) {
  const [profile, prefs, skills, availability, documents, staff] = await Promise.all([
    supabase.from('worker_profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('worker_preferences').select('*').eq('worker_id', userId).maybeSingle(),
    supabase.from('worker_skills').select('skill').eq('worker_id', userId),
    supabase.from('worker_availability').select('*').eq('worker_id', userId),
    supabase.from('worker_documents').select('document_type,status').eq('worker_id', userId),
    supabase.from('staff_profiles').select('id,is_verified,rating,review_count').eq('user_id', userId).maybeSingle(),
  ])
  const worker = {
    is_verified: staff.data?.is_verified === true,
    primary_profession: profile.data?.primary_profession,
    state: profile.data?.state,
    city: profile.data?.city,
    area: profile.data?.area,
    hourly_rate: profile.data?.hourly_rate,
    minimum_rate: profile.data?.minimum_rate,
    rating: staff.data?.rating || 0,
    preferences: prefs.data || {},
    skills: (skills.data || []).map((item) => item.skill),
    availability: availability.data || [],
    documents: documents.data || [],
  }
  worker.is_verified = isWorkerVerified(worker)
  return { worker, profile: profile.data, staff: staff.data }
}
