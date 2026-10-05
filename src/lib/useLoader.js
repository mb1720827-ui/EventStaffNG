import { useEffect, useState } from 'react'

// Unwrap a Supabase response, throwing so the loader can surface the message.
export function must({ data, error }) {
  if (error) throw error
  return data
}

// Run an async loader whenever `deps` change; expose a manual reload().
export function useLoader(load, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true }))
    Promise.resolve()
      .then(load)
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((error) => active && setState({ loading: false, data: null, error }))
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((n) => n + 1) }
}
