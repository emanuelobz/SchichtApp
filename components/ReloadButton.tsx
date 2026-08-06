'use client'

export default function ReloadButton() {
  return (
    <button
      type="button"
      className="btn secondary motherRefreshButton"
      onClick={() => location.reload()}
    >
      Aktualisieren ↻
    </button>
  )
}