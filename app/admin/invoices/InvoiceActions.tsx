'use client'

import { useState } from 'react'

type InvoiceActionsProps = {
  invoiceId: string
}

export default function InvoiceActions({ invoiceId }: InvoiceActionsProps) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  async function sendTestEmail() {
    setSending(true)
    setMessage('')
    setIsError(false)

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send-test`, {
        method: 'POST',
      })
      const result = (await response.json()) as {
        error?: string
        recipient?: string
      }

      if (!response.ok) {
        throw new Error(result.error || 'Testmail konnte nicht gesendet werden.')
      }

      setMessage(`Testmail wurde an ${result.recipient} gesendet ✓`)
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Testmail konnte nicht gesendet werden.'
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="invoiceToolbar noPrint">
      <div className="invoicePrintHint">
        Beim PDF-Export im Druckdialog „Kopf- und Fußzeilen“ deaktivieren.
        Die Testmail geht ausschließlich an die in RESEND_TEST_EMAIL
        hinterlegte Adresse.
      </div>

      {message && (
        <div className={isError ? 'error' : 'success'}>{message}</div>
      )}

      <div className="invoiceToolbarButtons">
        <button
          type="button"
          onClick={() => history.back()}
          className="btn secondary"
        >
          Zurück
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="btn secondary"
        >
          Als PDF exportieren / Drucken
        </button>

        <button
          type="button"
          onClick={sendTestEmail}
          disabled={sending}
          className="btn primary"
        >
          {sending ? 'Testmail wird gesendet …' : 'Testmail an mich senden'}
        </button>
      </div>
    </div>
  )
}
