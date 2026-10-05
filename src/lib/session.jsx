import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

// One auth subscription for the whole app. Previously every page, layout and
// route guard opened its own subscription and re-fetched the profile.
const SessionContext = createContext({ session: null, profile: null, initialized: true, refreshProfile: async () => {} })

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initialized, setInitialized] = useState(!supabase)

  const loadProfile = useCallback(async (next) => {
    setSession(next)
    if (!next) {
      setProfile(null)
      setInitialized(true)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', next.user.id).maybeSingle()
    setProfile(data)
    setInitialized(true)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      // Token refreshes don't change who is signed in; skip the profile refetch.
      if (event === 'TOKEN_REFRESHED') { setSession(next); return }
      // Defer so we never await Supabase inside its own auth callback.
      setTimeout(() => loadProfile(next), 0)
    })
    return () => subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    await loadProfile(data.session)
  }, [loadProfile])

  return <SessionContext.Provider value={{ session, profile, initialized, refreshProfile }}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
