'use client'

import { useState } from 'react'

type InvoiceActionsProps = {
  invoiceId: string
}

type SendInvoiceResponse = {
  error?: string
  recipient?: string
}

export default function InvoiceActions({
  invoiceId,
}: InvoiceActionsProps) {
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  async function sendInvoice() {
    const confirmed = window.confirm(
      'Rechnung wirklich an die hinterlegte Kunden-E-Mail-Adresse senden?\n\nBitte vorher Kundendaten, Rechnungsbetrag und E-Mail-Adresse kontrollieren.'
    )

    if (!confirmed) {
      return
    }

    setSending(true)
    setMessage('')
    setIsError(false)

    try {
      const response = await fetch(
        `/api/invoices/${invoiceId}/send-test`,
        {
          method: 'POST',
        }
      )

      const result = (await response.json()) as SendInvoiceResponse

      if (!response.ok) {
        throw new Error(
          result.error || 'Die Rechnung konnte nicht gesendet werden.'
        )
      }

      setMessage(
        result.recipient
          ? `Rechnung wurde an ${result.recipient} gesendet ✓`
          : 'Rechnung wurde erfolgreich gesendet ✓'
      )
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Die Rechnung konnte nicht gesendet werden.'
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="invoiceToolbar noPrint">
      <div className="invoicePrintHint">
        Bitte vor dem Versand Kundendaten, Rechnungsbetrag und
        E-Mail-Adresse prüfen. Die Rechnung wird als PDF an die beim Kunden
        hinterlegte E-Mail-Adresse gesendet.
      </div>

      {message && (
        <div
          className={isError ? 'error' : 'success'}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <div className="invoiceToolbarButtons">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="btn secondary"
          disabled={sending}
        >
          Zurück
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="btn secondary"
          disabled={sending}
        >
          Als PDF exportieren / Drucken
        </button>

        <button
          type="button"
          onClick={sendInvoice}
          disabled={sending}
          className="btn primary"
        >
          {sending
            ? 'Rechnung wird gesendet …'
            : 'Rechnung an Kunden senden'}
        </button>
      </div>
    </div>
  )
}