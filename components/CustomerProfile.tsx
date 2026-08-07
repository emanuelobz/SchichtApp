'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Customer = {
  id: string
  name: string
  hourly_rate: number
  active: boolean
  address?: string | null
  email?: string | null
  price_tier?: number | null
  travel_minutes?: number | null
  kilometers?: number | null
  service_location?: string | null
  invoice_description?: string | null
  notes?: string | null
  categories?: string[] | null
}

type WorkEntry = { id: string; work_date: string; hours: number; billed_rate?: number | null; notes?: string | null }
type Invoice = { id: string; invoice_number: number; invoice_date: string; service_period: string; total: number; status: string }
type MailRecipient = { id: string; sent_at: string | null; status: string; mail_campaigns: { subject: string; sent_at: string | null; status: string } | null }

type Props = { customer: Customer; onClose: () => void; onEdit: () => void }

const euro = (value: number) => Number(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const deDate = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE') : '–'

export default function CustomerProfile({ customer, onClose, onEdit }: Props) {
  const [entries, setEntries] = useState<WorkEntry[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [mails, setMails] = useState<MailRecipient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { void loadProfile() }, [customer.id])

  async function loadProfile() {
    setLoading(true); setError('')
    const supabase = createClient()
    const [entriesResult, invoicesResult, mailsResult] = await Promise.all([
      supabase.from('work_entries').select('id,work_date,hours,billed_rate,notes').eq('customer_id', customer.id).order('work_date', { ascending: false }),
      supabase.from('invoices').select('id,invoice_number,invoice_date,service_period,total,status').eq('customer_id', customer.id).order('invoice_date', { ascending: false }),
      supabase.from('mail_recipients').select('id,sent_at,status,mail_campaigns(subject,sent_at,status)').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    ])

    const firstError = entriesResult.error || invoicesResult.error || mailsResult.error
    if (firstError) setError(firstError.message)
    setEntries((entriesResult.data || []) as WorkEntry[])
    setInvoices((invoicesResult.data || []) as Invoice[])
    setMails((mailsResult.data || []) as unknown as MailRecipient[])
    setLoading(false)
  }

  const totalHours = useMemo(() => entries.reduce((sum, entry) => sum + Number(entry.hours), 0), [entries])
  const workedValue = useMemo(() => entries.reduce((sum, entry) => sum + Number(entry.hours) * Number(entry.billed_rate ?? customer.hourly_rate), 0), [entries, customer.hourly_rate])
  const invoicedTotal = useMemo(() => invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0), [invoices])

  return (
    <div className="stack">
      <div className="toolbar">
        <div>
          <div className="eyebrow">Kundenprofil</div>
          <h2 style={{ marginBottom: 4 }}>{customer.name}</h2>
          <div className="muted">{customer.active ? 'Aktiver Kunde' : 'Inaktiv'} · {euro(customer.hourly_rate)}/Std.</div>
        </div>
        <div className="actions"><button className="btn secondary" onClick={onClose}>Schließen</button><button className="btn primary" onClick={onEdit}>Bearbeiten</button></div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(customer.categories || []).length ? customer.categories!.map((category) => <span className="badge" key={category}>{category}</span>) : <span className="muted">Keine Kategorien</span>}
      </div>

      <div className="grid">
        <div className="stat"><strong>{String(totalHours).replace('.', ',')}</strong><span className="muted">Stunden gesamt</span></div>
        <div className="stat"><strong>{euro(workedValue)}</strong><span className="muted">Arbeitswert gesamt</span></div>
        <div className="stat"><strong>{euro(invoicedTotal)}</strong><span className="muted">Rechnungen gesamt</span></div>
        <div className="stat"><strong>{invoices.length}</strong><span className="muted">Rechnungen</span></div>
      </div>

      <section className="warning">
        <strong>Kontaktdaten</strong>
        <div className="muted" style={{ marginTop: 6 }}>{customer.email || 'Keine E-Mail'} · {customer.address || 'Keine Rechnungsadresse'}</div>
        {customer.service_location && <div className="muted">Leistungsort: {customer.service_location}</div>}
        {(customer.travel_minutes || customer.kilometers) && <div className="muted">Anfahrt: {customer.travel_minutes || 0} Min. · {customer.kilometers || 0} km</div>}
        {customer.notes && <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{customer.notes}</div>}
      </section>

      {loading ? <div className="muted">Kundenprofil wird geladen …</div> : error ? <div className="error">Fehler: {error}</div> : <>
        <section className="stack">
          <h3>Letzte Arbeitszeiten</h3>
          {entries.length ? <div className="entryList">{entries.slice(0, 12).map((entry) => <div className="entry" key={entry.id}><div className="entryMain"><div className="entryTitle">{deDate(entry.work_date)} · {String(entry.hours).replace('.', ',')} Std.</div><div className="entryMeta">{euro(Number(entry.billed_rate ?? customer.hourly_rate))}/Std.{entry.notes ? ` · ${entry.notes}` : ''}</div></div></div>)}</div> : <div className="muted">Noch keine Arbeitszeiten.</div>}
        </section>

        <section className="stack">
          <h3>Rechnungen</h3>
          {invoices.length ? <div className="entryList">{invoices.slice(0, 12).map((invoice) => <div className="entry" key={invoice.id}><div className="entryMain"><div className="entryTitle">Rechnung {invoice.invoice_number} · {euro(invoice.total)}</div><div className="entryMeta">{deDate(invoice.invoice_date)} · {invoice.service_period} · {invoice.status}</div></div><a className="btn secondary" href={`/admin/invoices/${invoice.id}`} target="_blank" rel="noreferrer">Öffnen</a></div>)}</div> : <div className="muted">Noch keine Rechnungen.</div>}
        </section>

        <section className="stack">
          <h3>Erhaltene Rundmails</h3>
          {mails.length ? <div className="entryList">{mails.slice(0, 12).map((mail) => <div className="entry" key={mail.id}><div className="entryMain"><div className="entryTitle">{mail.mail_campaigns?.subject || 'Rundmail'}</div><div className="entryMeta">{deDate(mail.sent_at || mail.mail_campaigns?.sent_at)} · {mail.status}</div></div></div>)}</div> : <div className="muted">Noch keine Rundmails an diesen Kunden.</div>}
        </section>
      </>}
    </div>
  )
}
