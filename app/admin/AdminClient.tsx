'use client'

import { useEffect, useMemo, useState } from 'react'
import LogoutButton from '@/components/LogoutButton'
import { createClient } from '@/lib/supabase/client'
import RoundMailsPanel from '@/components/RoundMailsPanel'

type Entry = {
  id: string
  worker_id: string
  customer_id: string
  work_date: string
  hours: number
  billed_rate?: number | null
  notes?: string | null
  customers: { name: string; hourly_rate: number } | null
}

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
}

type Profile = { id: string; display_name: string; role: string }

type CompanySettings = {
  id: number
  company_name?: string | null
  owner_name?: string | null
  address?: string | null
  postal_code?: string | null
  city?: string | null
  email?: string | null
  bank_name?: string | null
  iban?: string | null
  bic?: string | null
  tax_number?: string | null
  next_invoice_number: number
  small_business: boolean
  standard_description: string
  payment_days: number
}

type InvoiceSummary = {
  id: string
  invoice_number: number
  invoice_date: string
  service_period: string
  customer_name: string
  total: number
  status: string
  created_at: string
}

type Props = {
  displayName: string
  initialEntries: Entry[]
  customers: Customer[]
  workers: Profile[]
  initialSettings: CompanySettings | null
  initialInvoices: InvoiceSummary[]
}

const isoDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const deDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const euro = (value: number) =>
  Number(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const monthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(year, monthNumber, 1)
  return {
    start: `${month}-01`,
    end: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
  }
}

const formatPeriod = (dates: string[]) => {
  const sorted = [...dates].sort()
  if (!sorted.length) return ''
  if (sorted.length === 1) return deDate(sorted[0])
  if (sorted.length === 2) return `${deDate(sorted[0])} + ${deDate(sorted[1])}`
  return `${deDate(sorted[0])} - ${deDate(sorted.at(-1)!)}`
}

const blankCustomer = (): Customer => ({
  id: '',
  name: '',
  hourly_rate: 25,
  active: true,
  address: '',
  email: '',
  price_tier: 2,
  travel_minutes: null,
  kilometers: null,
  service_location: '',
  invoice_description: '',
  notes: '',
})

const defaultSettings: CompanySettings = {
  id: 1,
  company_name: '',
  owner_name: 'Juliet Obazee',
  address: 'Schäfflerbachstraße 11',
  postal_code: '86153',
  city: 'Augsburg',
  email: 'juliet.obazee@icloud.com',
  bank_name: 'Stadtsparkasse Augsburg',
  iban: 'DE9472050000252215082',
  bic: 'AUGSDE77XXX',
  tax_number: '103/256/00352',
  next_invoice_number: 303,
  small_business: true,
  standard_description: 'Raumreinigung',
  payment_days: 7,
}

export default function AdminClient({
  displayName,
  initialEntries,
  customers,
  workers,
  initialSettings,
  initialInvoices,
}: Props) {
  const [tab, setTab] = useState<'overview' | 'entries' | 'customers' | 'invoices' | 'mail' | 'settings'>('overview')
  const [month, setMonth] = useState(currentMonth())
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [customerRows, setCustomerRows] = useState<Customer[]>(customers)
  const [settings, setSettings] = useState<CompanySettings>(initialSettings || defaultSettings)
  const [invoices, setInvoices] = useState<InvoiceSummary[]>(initialInvoices)
  const [status, setStatus] = useState('')
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [newCustomer, setNewCustomer] = useState<Customer>(blankCustomer())
  const [invoiceBusy, setInvoiceBusy] = useState<string | null>(null)
  const [monthSending, setMonthSending] = useState(false)
  const [selectedInvoiceCustomer, setSelectedInvoiceCustomer] = useState('')
  const [newEntry, setNewEntry] = useState({
    worker_id: workers[0]?.id || '',
    customer_id: '',
    work_date: isoDate(new Date()),
    hours: '2',
    notes: '',
  })

  const filtered = useMemo(
    () => entries.filter((entry) => entry.work_date.startsWith(month)),
    [entries, month]
  )

  const rows = useMemo(() => {
    const map = new Map<string, { customer: Customer; dates: string[]; hours: number[]; rate: number }>()
    for (const entry of filtered) {
      const customer = customerRows.find((item) => item.id === entry.customer_id)
      if (!customer) continue
      const group = map.get(customer.id) || {
        customer,
        dates: [],
        hours: [],
        rate: Number(entry.billed_rate ?? customer.hourly_rate),
      }
      group.dates.push(entry.work_date)
      group.hours.push(Number(entry.hours))
      map.set(customer.id, group)
    }
    return [...map.values()]
      .map((group) => {
        const pairs = group.dates.map((date, index) => ({ date, hours: group.hours[index] })).sort((a, b) => a.date.localeCompare(b.date))
        const totalHours = pairs.reduce((sum, item) => sum + item.hours, 0)
        return {
          ...group,
          dates: pairs.map((item) => item.date),
          hours: pairs.map((item) => item.hours),
          totalHours,
          total: totalHours * group.rate,
          servicePeriod: formatPeriod(pairs.map((item) => item.date)),
        }
      })
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'de'))
  }, [filtered, customerRows])

  const selectedInvoiceRow = rows.find((row) => row.customer.id === selectedInvoiceCustomer) || null
  const totalHours = rows.reduce((sum, row) => sum + row.totalHours, 0)
  const totalAmount = rows.reduce((sum, row) => sum + row.total, 0)

  async function refresh() {
    const { start, end } = monthBounds(month)
    const { data, error } = await createClient()
      .from('work_entries')
      .select('id,worker_id,customer_id,work_date,hours,billed_rate,notes,customers(name,hourly_rate)')
      .gte('work_date', start)
      .lt('work_date', end)
      .order('work_date', { ascending: false })
    if (error) return setStatus(`Fehler: ${error.message}`)
    setEntries((data || []) as unknown as Entry[])
    setStatus('Aktualisiert ✓')
  }

  useEffect(() => {
    void refresh()
  }, [month])

  async function addEntry() {
    const hours = Number(newEntry.hours.replace(',', '.'))
    const customer = customerRows.find((item) => item.id === newEntry.customer_id)
    if (!newEntry.worker_id || !customer || !hours) return alert('Bitte alle Pflichtfelder ausfüllen.')
    const { data, error } = await createClient()
      .from('work_entries')
      .insert({
        ...newEntry,
        hours,
        notes: newEntry.notes || null,
        billed_rate: customer.hourly_rate,
      })
      .select('id,worker_id,customer_id,work_date,hours,billed_rate,notes,customers(name,hourly_rate)')
      .single()
    if (error) return alert(error.code === '23505' ? 'Dieser Eintrag existiert bereits.' : error.message)
    setEntries((current) => [data as unknown as Entry, ...current])
    setNewEntry((current) => ({ ...current, customer_id: '', hours: '2', notes: '' }))
  }

  async function updateEntry() {
    if (!editingEntry) return
    const customer = customerRows.find((item) => item.id === editingEntry.customer_id)
    const { data, error } = await createClient()
      .from('work_entries')
      .update({
        worker_id: editingEntry.worker_id,
        customer_id: editingEntry.customer_id,
        work_date: editingEntry.work_date,
        hours: Number(editingEntry.hours),
        notes: editingEntry.notes || null,
        billed_rate: customer?.hourly_rate || editingEntry.billed_rate,
      })
      .eq('id', editingEntry.id)
      .select('id,worker_id,customer_id,work_date,hours,billed_rate,notes,customers(name,hourly_rate)')
      .single()
    if (error) return alert(error.message)
    setEntries((current) => current.map((item) => (item.id === editingEntry.id ? (data as unknown as Entry) : item)))
    setEditingEntry(null)
  }

  async function removeEntry(id: string) {
    if (!confirm('Eintrag wirklich löschen?')) return
    const { error } = await createClient().from('work_entries').delete().eq('id', id)
    if (error) return alert(error.message)
    setEntries((current) => current.filter((item) => item.id !== id))
  }

  async function saveCustomer(customer: Customer, isNew = false) {
    const payload = {
      name: customer.name.trim(),
      hourly_rate: Number(customer.hourly_rate),
      active: customer.active,
      address: customer.address?.trim() || null,
      email: customer.email?.trim() || null,
      price_tier: customer.price_tier || null,
      travel_minutes: customer.travel_minutes || null,
      kilometers: customer.kilometers || null,
      service_location: customer.service_location?.trim() || null,
      invoice_description: customer.invoice_description?.trim() || null,
      notes: customer.notes?.trim() || null,
    }
    if (!payload.name) return alert('Bitte Kundennamen eintragen.')
    const query = isNew
      ? createClient().from('customers').insert(payload)
      : createClient().from('customers').update(payload).eq('id', customer.id)
    const { data, error } = await query.select('*').single()
    if (error) return alert(error.message)
    if (isNew) {
      setCustomerRows((current) => [...current, data as Customer].sort((a, b) => a.name.localeCompare(b.name, 'de')))
      setNewCustomer(blankCustomer())
    } else {
      setCustomerRows((current) => current.map((item) => (item.id === customer.id ? (data as Customer) : item)))
      setEditingCustomer(null)
    }
  }

  async function saveSettings() {
    const { data, error } = await createClient()
      .from('company_settings')
      .upsert(settings)
      .select('*')
      .single()
    if (error) return alert(error.message)
    setSettings(data as CompanySettings)
    setStatus('Unternehmensdaten gespeichert ✓')
  }

  async function createInvoice() {
    if (!selectedInvoiceRow) return alert('Bitte einen Kunden auswählen.')
    const customer = selectedInvoiceRow.customer
    if (!customer.address || !customer.email) {
      setEditingCustomer(customer)
      return alert('Bitte zuerst Adresse und E-Mail des Kunden ergänzen.')
    }
    setInvoiceBusy(customer.id)
    const invoiceNumber = Number(settings.next_invoice_number)
    const invoiceDate = isoDate(new Date())
    const description = customer.invoice_description || settings.standard_description || 'Raumreinigung'
    const lineItems = selectedInvoiceRow.hours.map((hours, index) => ({
      position: index + 1,
      description,
      date: selectedInvoiceRow.dates[index],
      quantity: hours,
      unitPrice: selectedInvoiceRow.rate,
      total: hours * selectedInvoiceRow.rate,
    }))
    const snapshot = {
      company: settings,
      customer,
      lineItems,
      month,
    }
    const { data, error } = await createClient()
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        service_month: month,
        service_period: selectedInvoiceRow.servicePeriod,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_address: customer.address,
        customer_email: customer.email,
        description,
        total_hours: selectedInvoiceRow.totalHours,
        hourly_rate: selectedInvoiceRow.rate,
        total: selectedInvoiceRow.total,
        status: 'created',
        snapshot,
      })
      .select('id,invoice_number,invoice_date,service_period,customer_name,total,status,created_at')
      .single()
    if (error) {
      setInvoiceBusy(null)
      return alert(error.message)
    }
    const nextNumber = invoiceNumber + 1
    await createClient().from('company_settings').update({ next_invoice_number: nextNumber }).eq('id', 1)
    setSettings((current) => ({ ...current, next_invoice_number: nextNumber }))
    setInvoices((current) => [data as InvoiceSummary, ...current])
    setInvoiceBusy(null)
    window.open(`/admin/invoices/${data.id}`, '_blank', 'noopener,noreferrer')
  }

  async function sendMonthInvoices() {
  const [year, monthNumber] = month.split('-')

  const monthName = new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(Number(year), Number(monthNumber) - 1, 1))

  const confirmed = window.confirm(
    `Alle noch nicht versendeten Rechnungen für ${monthName} senden?\n\n` +
      'Bereits versendete, bezahlte oder stornierte Rechnungen werden nicht erneut gesendet.'
  )

  if (!confirmed) {
    return
  }

  setMonthSending(true)
  setStatus('Rechnungen werden gesendet …')

  try {
    const response = await fetch('/api/invoices/send-month', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        month,
      }),
    })

    const result = (await response.json()) as {
      error?: string
      message?: string
      total?: number
      sent?: number
      failed?: number
      skipped?: number
      sentIds?: string[]
      results?: Array<{
        invoiceId: string
        invoiceNumber: number
        customerName: string
        recipient?: string
        success: boolean
        error?: string
      }>
    }

    if (!response.ok) {
      throw new Error(
        result.error || 'Der Monatsversand konnte nicht ausgeführt werden.'
      )
    }

    const sentIds = result.sentIds || []

    if (sentIds.length > 0) {
      setInvoices((current) =>
        current.map((invoice) =>
          sentIds.includes(invoice.id)
            ? {
                ...invoice,
                status: 'sent',
              }
            : invoice
        )
      )
    }

    if (result.total === 0) {
      setStatus(
        result.message ||
          'Für diesen Monat gibt es keine unversendeten Rechnungen.'
      )
      return
    }

    const summary = [
      `${result.sent || 0} erfolgreich gesendet`,
      `${result.skipped || 0} übersprungen`,
      `${result.failed || 0} fehlgeschlagen`,
    ].join(' · ')

    if ((result.failed || 0) > 0) {
      const failedInvoices = (result.results || [])
        .filter((item) => !item.success && item.error)
        .map(
          (item) =>
            `Rechnung ${item.invoiceNumber} – ${item.customerName}: ${item.error}`
        )
        .join('\n')

      setStatus(`Fehler: ${summary}`)

      window.alert(
        `${summary}\n\n${failedInvoices || 'Einige Rechnungen konnten nicht gesendet werden.'}`
      )

      return
    }

    setStatus(`Monatsversand abgeschlossen: ${summary} ✓`)
  } catch (error) {
    setStatus(
      `Fehler: ${
        error instanceof Error
          ? error.message
          : 'Unbekannter Fehler beim Monatsversand.'
      }`
    )
  } finally {
    setMonthSending(false)
  }
}

  async function setInvoiceStatus(id: string, value: string) {
    const { error } = await createClient().from('invoices').update({ status: value }).eq('id', id)
    if (error) return alert(error.message)
    setInvoices((current) => current.map((item) => (item.id === id ? { ...item, status: value } : item)))
  }

  return (
    <main className="shell">
      <div className="top">
        <div>
          <div className="eyebrow">Adminbereich</div>
          <h1>Hallo {displayName}</h1>
          <div className="muted">Schichten, Kunden und Rechnungen an einem Ort.</div>
        </div>
        <LogoutButton />
      </div>

      <div className="tabs">
        {[
          ['overview', 'Monatsübersicht'],
          ['entries', 'Einträge'],
          ['customers', 'Kunden'],
          ['invoices', 'Rechnungen'],
          ['mail', 'Rundmails'],
          ['settings', 'Einstellungen'],
        ].map(([value, label]) => (
          <button key={value} className={`tab ${tab === value ? 'active' : ''}`} onClick={() => setTab(value as typeof tab)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ height: 16 }} />
      {status && <div className={status.startsWith('Fehler') ? 'error' : 'success'}>{status}</div>}
      {status && <div style={{ height: 12 }} />}

      {tab === 'overview' && (
        <section className="card stack">
          <div className="toolbar">
            <div className="field monthField"><label>Monat</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <button className="btn secondary" onClick={refresh}>Aktualisieren</button>
          </div>
          <div className="grid">
            <div className="stat"><strong>{filtered.length}</strong><span className="muted">Einzeltermine</span></div>
            <div className="stat"><strong>{String(totalHours).replace('.', ',')}</strong><span className="muted">Stunden</span></div>
            <div className="stat"><strong>{euro(totalAmount)}</strong><span className="muted">Gesamtbetrag</span></div>
          </div>
          <div className="tablewrap"><table className="table"><thead><tr><th>Kunde</th><th>Leistungsdaten</th><th>Stunden</th><th>Preis</th><th>Gesamt</th></tr></thead><tbody>
            {rows.length ? rows.map((row) => <tr key={row.customer.id}><td><strong>{row.customer.name}</strong></td><td>{row.servicePeriod}</td><td>{row.hours.map((v) => String(v).replace('.', ',')).join(' · ')}</td><td>{euro(row.rate)}</td><td><strong>{euro(row.total)}</strong></td></tr>) : <tr><td colSpan={5}><div className="empty">Keine Einträge in diesem Monat.</div></td></tr>}
          </tbody></table></div>
        </section>
      )}

      {tab === 'entries' && (
        <div className="split">
          <section className="card stack">
            <h2>Eintrag ergänzen</h2>
            <div className="field"><label>Mitarbeiterin</label><select value={newEntry.worker_id} onChange={(e) => setNewEntry({ ...newEntry, worker_id: e.target.value })}>{workers.map((w) => <option key={w.id} value={w.id}>{w.display_name}</option>)}</select></div>
            <div className="field"><label>Kunde</label><select value={newEntry.customer_id} onChange={(e) => setNewEntry({ ...newEntry, customer_id: e.target.value })}><option value="">Bitte auswählen</option>{customerRows.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label>Datum</label><input type="date" value={newEntry.work_date} onChange={(e) => setNewEntry({ ...newEntry, work_date: e.target.value })} /></div>
            <div className="field"><label>Stunden</label><input inputMode="decimal" value={newEntry.hours} onChange={(e) => setNewEntry({ ...newEntry, hours: e.target.value })} /></div>
            <div className="field"><label>Notiz</label><textarea value={newEntry.notes} onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })} /></div>
            <button className="btn primary" onClick={addEntry}>Eintrag hinzufügen</button>
          </section>
          <section className="card">
            <h2>Einzelne Einträge</h2>
            <div className="entryList">{filtered.map((entry) => <div className="entry" key={entry.id}><div className="entryMain"><div className="entryTitle">{customerRows.find((c) => c.id === entry.customer_id)?.name || entry.customers?.name}</div><div className="entryMeta">{deDate(entry.work_date)} · {String(entry.hours).replace('.', ',')} Std. · {workers.find((w) => w.id === entry.worker_id)?.display_name || 'Mitarbeiterin'}{entry.notes ? ` · ${entry.notes}` : ''}</div></div><div className="entryActions"><button className="btn secondary" onClick={() => setEditingEntry(entry)}>Bearbeiten</button><button className="btn danger" onClick={() => removeEntry(entry.id)}>Löschen</button></div></div>)}</div>
          </section>
        </div>
      )}

      {tab === 'customers' && (
        <div className="split">
          <CustomerForm title="Neuen Kunden anlegen" customer={newCustomer} onChange={setNewCustomer} onSave={() => saveCustomer(newCustomer, true)} saveLabel="Kunde speichern" />
          <section className="card"><h2>Kundenliste</h2><div className="entryList">{customerRows.map((customer) => <div className="entry" key={customer.id}><div className="entryMain"><div className="entryTitle">{customer.name}</div><div className="entryMeta">{euro(customer.hourly_rate)} · {customer.address || 'Adresse fehlt'} · {customer.email || 'E-Mail fehlt'}{customer.invoice_description ? ` · ${customer.invoice_description}` : ''}</div></div><button className="btn secondary" onClick={() => setEditingCustomer(customer)}>Bearbeiten</button></div>)}</div></section>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="stack">
          <section className="card stack">
            <div className="toolbar"><div className="field monthField"><label>Abrechnungsmonat</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div><div className="badge">Nächste Rechnungsnummer: {settings.next_invoice_number}</div></div>
            <div className="field"><label>Kunde</label><select value={selectedInvoiceCustomer} onChange={(e) => setSelectedInvoiceCustomer(e.target.value)}><option value="">Bitte auswählen</option>{rows.map((row) => <option key={row.customer.id} value={row.customer.id}>{row.customer.name} · {euro(row.total)}</option>)}</select></div>
            {selectedInvoiceRow && <div className="invoicePreviewCard"><div><strong>{selectedInvoiceRow.customer.name}</strong><div className="muted">{selectedInvoiceRow.servicePeriod}</div></div><div><strong>{String(selectedInvoiceRow.totalHours).replace('.', ',')} Std.</strong><div className="muted">{selectedInvoiceRow.customer.invoice_description || settings.standard_description}</div></div><div><strong>{euro(selectedInvoiceRow.total)}</strong><div className="muted">Gesamt</div></div></div>}
            <button className="btn primary" disabled={!selectedInvoiceRow || !!invoiceBusy} onClick={createInvoice}>{invoiceBusy ? 'Rechnung wird erstellt …' : 'Rechnung erstellen und öffnen'}</button>
            <div className="warning">Die Rechnung wird archiviert und die Rechnungsnummer sofort erhöht. Bitte vorher Kundendaten und Beträge prüfen.</div>
          </section>
            <section className="card stack">
              <div className="toolbar">
                <div>
                  <h2>Rechnungsarchiv</h2>
                  <div className="muted">
                    Sammelversand für den ausgewählten Abrechnungsmonat
                  </div>
                </div>

                <button
                  type="button"
                  className="btn primary"
                  onClick={sendMonthInvoices}
                  disabled={monthSending}
                >
                  {monthSending
                    ? 'Rechnungen werden gesendet …'
                    : 'Alle offenen Rechnungen dieses Monats senden'}
                </button>
              </div>

              <div className="warning">
                Versendet werden nur Rechnungen mit dem Status „Erstellt“. Bereits
                versendete, bezahlte oder stornierte Rechnungen werden übersprungen.
              </div>

              <div className="tablewrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nr.</th>
                      <th>Datum</th>
                      <th>Kunde</th>
                      <th>Zeitraum</th>
                      <th>Betrag</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.invoice_number}</td>
                        <td>{deDate(invoice.invoice_date)}</td>
                        <td>
                          <strong>{invoice.customer_name}</strong>
                        </td>
                        <td>{invoice.service_period}</td>
                        <td>{euro(invoice.total)}</td>

                        <td>
                          <select
                            value={invoice.status}
                            onChange={(e) =>
                              setInvoiceStatus(invoice.id, e.target.value)
                            }
                            disabled={monthSending}
                          >
                            <option value="created">Erstellt</option>
                            <option value="sent">Versendet</option>
                            <option value="paid">Bezahlt</option>
                            <option value="cancelled">Storniert</option>
                          </select>
                        </td>

                        <td>
                          <a
                            className="btn secondary invoiceLink"
                            href={`/admin/invoices/${invoice.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Öffnen
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
        </div>
      )}

      {tab === 'mail' && (
        <RoundMailsPanel
          customers={customerRows}
          senderName={settings.owner_name || settings.company_name || 'Juliet Obazee'}
          senderEmail={settings.email || ''}
          onStatus={setStatus}
        />
      )}

      {tab === 'settings' && (
        <section className="card stack"><h2>Unternehmensdaten</h2><div className="formGrid">
          <TextField label="Firmenname (optional)" value={settings.company_name || ''} onChange={(v) => setSettings({ ...settings, company_name: v })} />
          <TextField label="Name / Inhaberin" value={settings.owner_name || ''} onChange={(v) => setSettings({ ...settings, owner_name: v })} />
          <TextField label="Straße und Hausnummer" value={settings.address || ''} onChange={(v) => setSettings({ ...settings, address: v })} />
          <TextField label="PLZ" value={settings.postal_code || ''} onChange={(v) => setSettings({ ...settings, postal_code: v })} />
          <TextField label="Ort" value={settings.city || ''} onChange={(v) => setSettings({ ...settings, city: v })} />
          <TextField label="E-Mail" value={settings.email || ''} onChange={(v) => setSettings({ ...settings, email: v })} />
          <TextField label="Bank" value={settings.bank_name || ''} onChange={(v) => setSettings({ ...settings, bank_name: v })} />
          <TextField label="IBAN" value={settings.iban || ''} onChange={(v) => setSettings({ ...settings, iban: v })} />
          <TextField label="BIC" value={settings.bic || ''} onChange={(v) => setSettings({ ...settings, bic: v })} />
          <TextField label="Steuernummer" value={settings.tax_number || ''} onChange={(v) => setSettings({ ...settings, tax_number: v })} />
          <NumberField label="Nächste Rechnungsnummer" value={settings.next_invoice_number} onChange={(v) => setSettings({ ...settings, next_invoice_number: v })} />
          <NumberField label="Zahlungsziel in Tagen" value={settings.payment_days} onChange={(v) => setSettings({ ...settings, payment_days: v })} />
          <TextField label="Standard-Leistungsbeschreibung" value={settings.standard_description} onChange={(v) => setSettings({ ...settings, standard_description: v })} />
        </div><label className="checkline"><input type="checkbox" checked={settings.small_business} onChange={(e) => setSettings({ ...settings, small_business: e.target.checked })} /> Kleinunternehmerregelung nach § 19 UStG</label><button className="btn primary" onClick={saveSettings}>Unternehmensdaten speichern</button></section>
      )}

      {editingEntry && <div className="modalBackdrop" onClick={() => setEditingEntry(null)}><div className="card modal stack" onClick={(e) => e.stopPropagation()}><h2>Eintrag bearbeiten</h2><div className="field"><label>Mitarbeiterin</label><select value={editingEntry.worker_id} onChange={(e) => setEditingEntry({ ...editingEntry, worker_id: e.target.value })}>{workers.map((w) => <option key={w.id} value={w.id}>{w.display_name}</option>)}</select></div><div className="field"><label>Kunde</label><select value={editingEntry.customer_id} onChange={(e) => setEditingEntry({ ...editingEntry, customer_id: e.target.value })}>{customerRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Datum</label><input type="date" value={editingEntry.work_date} onChange={(e) => setEditingEntry({ ...editingEntry, work_date: e.target.value })} /></div><div className="field"><label>Stunden</label><input value={editingEntry.hours} onChange={(e) => setEditingEntry({ ...editingEntry, hours: Number(e.target.value.replace(',', '.')) })} /></div><div className="field"><label>Notiz</label><textarea value={editingEntry.notes || ''} onChange={(e) => setEditingEntry({ ...editingEntry, notes: e.target.value })} /></div><div className="actions"><button className="btn secondary" onClick={() => setEditingEntry(null)}>Abbrechen</button><button className="btn primary" onClick={updateEntry}>Speichern</button></div></div></div>}
      {editingCustomer && <div className="modalBackdrop" onClick={() => setEditingCustomer(null)}><div onClick={(e) => e.stopPropagation()}><CustomerForm title="Kunde bearbeiten" customer={editingCustomer} onChange={setEditingCustomer} onSave={() => saveCustomer(editingCustomer)} saveLabel="Änderungen speichern" onCancel={() => setEditingCustomer(null)} /></div></div>}
    </main>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="field"><label>{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} /></div>
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return <div className="field"><label>{label}</label><input type="number" step={step} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} /></div>
}

function CustomerForm({ title, customer, onChange, onSave, saveLabel, onCancel }: { title: string; customer: Customer; onChange: (value: Customer) => void; onSave: () => void; saveLabel: string; onCancel?: () => void }) {
  return <section className="card stack customerForm"><h2>{title}</h2><div className="formGrid">
    <TextField label="Name" value={customer.name} onChange={(v) => onChange({ ...customer, name: v })} />
    <NumberField label="Stundenpreis" value={Number(customer.hourly_rate)} step={0.5} onChange={(v) => onChange({ ...customer, hourly_rate: v })} />
    <TextField label="Rechnungsadresse" value={customer.address || ''} onChange={(v) => onChange({ ...customer, address: v })} />
    <TextField label="E-Mail" value={customer.email || ''} onChange={(v) => onChange({ ...customer, email: v })} />
    <NumberField label="Preisstufe" value={Number(customer.price_tier || 0)} onChange={(v) => onChange({ ...customer, price_tier: v })} />
    <NumberField label="Anfahrt in Minuten" value={Number(customer.travel_minutes || 0)} onChange={(v) => onChange({ ...customer, travel_minutes: v })} />
    <NumberField label="Kilometer" value={Number(customer.kilometers || 0)} step={0.1} onChange={(v) => onChange({ ...customer, kilometers: v })} />
    <TextField label="Leistungsort (optional)" value={customer.service_location || ''} onChange={(v) => onChange({ ...customer, service_location: v })} />
    <TextField label="Individuelle Leistungsbeschreibung" value={customer.invoice_description || ''} onChange={(v) => onChange({ ...customer, invoice_description: v })} />
    <TextField label="Notizen" value={customer.notes || ''} onChange={(v) => onChange({ ...customer, notes: v })} />
  </div><label className="checkline"><input type="checkbox" checked={customer.active} onChange={(e) => onChange({ ...customer, active: e.target.checked })} /> Kunde ist aktiv</label><div className="actions">{onCancel && <button className="btn secondary" onClick={onCancel}>Abbrechen</button>}<button className="btn primary" onClick={onSave}>{saveLabel}</button></div></section>
}
