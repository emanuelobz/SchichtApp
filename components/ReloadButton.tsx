'use client'

import { useState } from 'react'

export default function ReloadButton() {
  const [loading, setLoading] = useState(false)

  function reload() {
    if (loading) return

    setLoading(true)

    // Kurze Verzögerung, damit die Berührung sichtbar bestätigt wird
    window.setTimeout(() => {
      window.location.reload()
    }, 250)
  }

  return (
    <button
      type="button"
      className={`btn secondary motherRefreshButton ${
        loading ? 'buttonConfirmed' : ''
      }`}
      onClick={reload}
      disabled={loading}
    >
      {loading ? 'Wird aktualisiert …' : 'Aktualisieren ↻'}
    </button>
  )
}