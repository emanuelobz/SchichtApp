'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const [loading, setLoading] = useState(false)

  async function logout() {
    if (loading) return

    setLoading(true)

    const supabase = createClient()
    await supabase.auth.signOut()

    window.location.href = '/login'
  }

  return (
    <button
      type="button"
      className={`btn secondary ${
        loading ? 'buttonConfirmed' : ''
      }`}
      onClick={logout}
      disabled={loading}
    >
      {loading ? 'Wird abgemeldet …' : 'Abmelden'}
    </button>
  )
}