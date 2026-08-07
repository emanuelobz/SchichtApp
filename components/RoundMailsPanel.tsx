'use client'

import { useEffect, useMemo, useState } from 'react'

type Customer = {
  id: string
  name: string
  active: boolean
  email?: string | null
  hourly_rate: number
  categories?: string[] | null
}

type Recipient = {
  id: string
  customer_name: string | null
  email: string
  status: 'pending' | 'sending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
}

type Campaign = {
  id: string
  subject: string
  message: string
  status: 'draft' | 'sending' | 'sent' | 'failed'
  created_at: string
  sent_at: string | null
  recipients: Recipient[]
}

type Props = {
  customers: Customer[]
  senderName: string
  senderEmail: string
  onStatus: (message: string) => void
}

const defaultMessage = `Guten Tag {{Kundenname}},

aufgrund der in den vergangenen Jahren gestiegenen Betriebs- und Lebenshaltungskosten passen wir unsere Stundensätze in zwei Schritten an.

Die erste Anpassung gilt ab dem [Datum].
Die zweite Anpassung gilt ab dem [Datum].

Durch die frühzeitige Information möchten wir Ihnen ausreichend Zeit geben, sich auf die Änderungen einzustellen.

Vielen Dank für Ihr Verständnis und Ihr Vertrauen.

Freundliche Grüße`

const formatDate = (value: string | null) => {
  if (!value) return '–'
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const euro = (value: number) =>
  Number(value).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export default function RoundMailsPanel({ customers, senderName, senderEmail, onStatus }: Props) {
  const availableCustomers = useMemo(
    () => customers.filter((customer) => customer.active && customer.email?.trim()),
    [customers]
  )

  const customersWithoutEmail = useMemo(
    () => customers.filter((customer) => customer.active && !customer.email?.trim()),
    [customers]
  )

  const priceOptions = useMemo<number[]>(
    () => Array.from(new Set<number>(availableCustomers.map((customer) => Number(customer.hourly_rate)))).sort((a, b) => a - b),
    [availableCustomers]
  )

  const categoryOptions = useMemo<string[]>(
    () => Array.from(new Set<string>(availableCustomers.flatMap((customer) => customer.categories || []))).sort((a, b) => a.localeCompare(b, 'de')),
    [availableCustomers]
  )

  const [subject, setSubject] = useState('Information zur Anpassung unseres Stundensatzes')
  const [message, setMessage] = useState(defaultMessage)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedPrices, setSelectedPrices] = useState<number[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState(senderEmail)
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [history, setHistory] = useState<Campaign[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null)

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de')
    return availableCustomers.filter((customer) => {
      const priceMatch = selectedPrices.length === 0 || selectedPrices.includes(Number(customer.hourly_rate))
      const categoryMatch = selectedCategories.length === 0 || selectedCategories.every((category) => (customer.categories || []).includes(category))
      const searchMatch = !term || customer.name.toLocaleLowerCase('de').includes(term) || customer.email?.toLocaleLowerCase('de').includes(term)
      return priceMatch && categoryMatch && searchMatch
    })
  }, [availableCustomers, selectedPrices, selectedCategories, search])

  const filteredIds = filteredCustomers.map((customer) => customer.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id))
  const selectedCustomers = availableCustomers.filter((customer) => selectedIds.includes(customer.id))
  const previewCustomer = selectedCustomers[0] || filteredCustomers[0] || availableCustomers[0]
  const previewMessage = message.replaceAll('{{Kundenname}}', previewCustomer?.name || 'Max Mustermann').concat(`\n${senderName}`)

  useEffect(() => { void loadHistory() }, [])

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const response = await fetch('/api/mail-campaigns', { cache: 'no-store' })
      const result = (await response.json()) as { campaigns?: Campaign[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Historie konnte nicht geladen werden.')
      setHistory(result.campaigns || [])
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Historie konnte nicht geladen werden.')
    } finally {
      setHistoryLoading(false)
    }
  }

  function togglePrice(price: number) {
    setSelectedPrices((current) => current.includes(price) ? current.filter((item) => item !== price) : [...current, price])
  }

  function toggleCategory(category: string) {
    setSelectedCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category])
  }

  function clearFilters() {
    setSelectedPrices([])
    setSelectedCategories([])
    setSearch('')
  }

  function toggleFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) return current.filter((id) => !filteredIds.includes(id))
      return [...new Set([...current, ...filteredIds])]
    })
  }

  function toggleCustomer(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((customerId) => customerId !== id) : [...current, id])
  }

  function validateCampaign() {
    if (!subject.trim()) { window.alert('Bitte einen Betreff eintragen.'); return false }
    if (!message.trim()) { window.alert('Bitte eine Nachricht eintragen.'); return false }
    return true
  }

  function openConfirmation() {
    if (!validateCampaign()) return
    if (!selectedIds.length) { window.alert('Bitte mindestens einen Kunden auswählen.'); return }
    setShowConfirmation(true)
  }

  async function sendTestMail() {
    if (!validateCampaign()) return
    if (!testEmail.trim() || !testEmail.includes('@')) { window.alert('Bitte eine gültige Test-E-Mail-Adresse eintragen.'); return }
    setTesting(true)
    onStatus('Testmail wird gesendet …')
    try {
      const response = await fetch('/api/mail-campaigns/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), email: testEmail.trim(), customerName: previewCustomer?.name || 'Testkunde' }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Testmail konnte nicht gesendet werden.')
      onStatus(`Testmail an ${testEmail.trim()} gesendet ✓`)
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Testmail konnte nicht gesendet werden.')
    } finally { setTesting(false) }
  }

  async function sendCampaign() {
    setShowConfirmation(false)
    setSending(true)
    onStatus('Rundmail wird versendet …')
    try {
      const response = await fetch('/api/mail-campaigns/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim(), customerIds: selectedIds }),
      })
      const result = (await response.json()) as { error?: string; sent?: number; failed?: number; results?: Array<{ customerName: string; success: boolean; error?: string }> }
      if (!response.ok) throw new Error(result.error || 'Die Rundmail konnte nicht versendet werden.')
      const sent = result.sent || 0
      const failed = result.failed || 0
      if (failed > 0) {
        const failedNames = (result.results || []).filter((item) => !item.success).map((item) => `${item.customerName}: ${item.error || 'Fehler'}`).join('\n')
        onStatus(`${sent} gesendet · ${failed} fehlgeschlagen`)
        window.alert(`${sent} E-Mails wurden erfolgreich gesendet.\n${failed} sind fehlgeschlagen.\n\n${failedNames}`)
      } else {
        onStatus(`Rundmail erfolgreich an ${sent} Kunden gesendet ✓`)
        setSelectedIds([])
      }
      await loadHistory()
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Unbekannter Versandfehler.')
    } finally { setSending(false) }
  }

  return (
    <div className="stack">
      <section className="card stack">
        <div><h2>Neue Rundmail</h2><div className="muted">Jeder Kunde erhält eine eigene E-Mail. Andere Empfänger sind nicht sichtbar.</div></div>
        <div className="field"><label>Betreff</label><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Betreff der E-Mail" disabled={sending || testing} /></div>
        <div className="field"><label>Nachricht</label><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={14} disabled={sending || testing} /><div className="muted">Mit <strong>{'{{Kundenname}}'}</strong> wird automatisch der jeweilige Kundenname eingesetzt.</div></div>
      </section>

      <section className="card stack">
        <div className="toolbar"><div><h2>Empfänger filtern</h2><div className="muted">Preis und Kategorien können miteinander kombiniert werden.</div></div><button type="button" className="btn secondary" onClick={clearFilters}>Filter zurücksetzen</button></div>
        <div className="field"><label>Kunde suchen</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name oder E-Mail" /></div>
        <div className="field"><label>Stundenpreis</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{priceOptions.map((price) => <button key={price} type="button" className={`btn ${selectedPrices.includes(price) ? 'primary' : 'secondary'}`} onClick={() => togglePrice(price)}>{euro(price)}/Std.</button>)}</div></div>
        <div className="field"><label>Kategorien</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{categoryOptions.length ? categoryOptions.map((category) => <button key={category} type="button" className={`btn ${selectedCategories.includes(category) ? 'primary' : 'secondary'}`} onClick={() => toggleCategory(category)}>{category}</button>) : <span className="muted">Noch keine Kategorien bei Kunden hinterlegt.</span>}</div></div>
      </section>

      <section className="card stack">
        <div className="toolbar">
          <div><h2>Empfänger</h2><div className="muted">{filteredCustomers.length} Treffer · {selectedIds.length} insgesamt ausgewählt</div></div>
          <button type="button" className="btn secondary" onClick={toggleFiltered} disabled={sending || testing || filteredCustomers.length === 0}>{allFilteredSelected ? 'Gefilterte abwählen' : `Alle ${filteredCustomers.length} auswählen`}</button>
        </div>
        {filteredCustomers.length === 0 ? <div className="warning">Für diese Filter gibt es keine passenden Kunden mit E-Mail-Adresse.</div> : <div className="stack">{filteredCustomers.map((customer) => (
          <label className="checkline" key={customer.id}><input type="checkbox" checked={selectedIds.includes(customer.id)} onChange={() => toggleCustomer(customer.id)} disabled={sending || testing} /><span><strong>{customer.name}</strong><span className="muted"> · {euro(customer.hourly_rate)}/Std. · {customer.email}{customer.categories?.length ? ` · ${customer.categories.join(', ')}` : ''}</span></span></label>
        ))}</div>}
        {customersWithoutEmail.length > 0 && <div className="warning">Ohne E-Mail-Adresse: {customersWithoutEmail.map((customer) => customer.name).join(', ')}</div>}
      </section>

      <section className="card stack">
        <div><h2>Test & Versand</h2><div className="muted">Schicke dir zuerst eine Testmail, bevor die Nachricht an Kunden geht.</div></div>
        <div className="field"><label>Testmail an</label><input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="deine@email.de" disabled={sending || testing} /></div>
        <div className="actions">
          <button type="button" className="btn secondary" onClick={sendTestMail} disabled={sending || testing}>{testing ? 'Testmail wird gesendet …' : 'Testmail senden'}</button>
          <button type="button" className="btn secondary" onClick={() => setShowPreview((current) => !current)} disabled={sending || testing}>{showPreview ? 'Vorschau schließen' : 'Vorschau anzeigen'}</button>
          <button type="button" className="btn primary" onClick={openConfirmation} disabled={sending || testing || selectedIds.length === 0}>{sending ? 'Rundmail wird gesendet …' : `Versand prüfen (${selectedIds.length})`}</button>
        </div>
        {showPreview && <div className="stack"><div className="muted">Vorschau für {previewCustomer?.name || 'Beispielkunde'}</div><div style={{ border: '1px solid rgba(127,127,127,.22)', borderRadius: 18, overflow: 'hidden', background: '#f5f6f8', padding: 18 }}><div style={{ maxWidth: 620, margin: '0 auto', background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 12px 35px rgba(15,23,42,.08)', color: '#172033' }}><div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{senderName}</div><strong style={{ fontSize: 20 }}>{subject || 'Ohne Betreff'}</strong><div style={{ height: 22 }} /><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{previewMessage}</div></div></div></div>}
      </section>

      <section className="card stack">
        <div className="toolbar"><div><h2>Versandhistorie</h2><div className="muted">Die zuletzt verschickten Rundmails und ihr Versandstatus.</div></div><button type="button" className="btn secondary" onClick={loadHistory} disabled={historyLoading}>{historyLoading ? 'Wird geladen …' : 'Aktualisieren'}</button></div>
        {historyLoading ? <div className="muted">Historie wird geladen …</div> : history.length === 0 ? <div className="muted">Noch keine Rundmail verschickt.</div> : <div className="stack">{history.map((campaign) => {
          const sentCount = campaign.recipients.filter((recipient) => recipient.status === 'sent').length
          const failedCount = campaign.recipients.filter((recipient) => recipient.status === 'failed').length
          const isExpanded = expandedCampaignId === campaign.id
          return <div className="warning" key={campaign.id}><div className="toolbar"><div><strong>{campaign.subject}</strong><div className="muted">{formatDate(campaign.sent_at || campaign.created_at)} · {sentCount} gesendet{failedCount > 0 ? ` · ${failedCount} fehlgeschlagen` : ''}</div></div><button type="button" className="btn secondary" onClick={() => setExpandedCampaignId(isExpanded ? null : campaign.id)}>{isExpanded ? 'Schließen' : 'Details'}</button></div>{isExpanded && <div className="stack" style={{ marginTop: 16 }}><div style={{ whiteSpace: 'pre-wrap' }}>{campaign.message}</div><div style={{ borderTop: '1px solid rgba(127,127,127,.2)', paddingTop: 12 }}>{campaign.recipients.map((recipient) => <div key={recipient.id} style={{ padding: '6px 0' }}><strong>{recipient.status === 'sent' ? '✓' : recipient.status === 'failed' ? '✕' : '…'} {recipient.customer_name || recipient.email}</strong><span className="muted"> · {recipient.email}</span>{recipient.error_message && <div className="muted">Fehler: {recipient.error_message}</div>}</div>)}</div></div>}</div>
        })}</div>}
      </section>

      {showConfirmation && <div role="dialog" aria-modal="true" aria-label="Rundmail bestätigen" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5,10,20,.62)', display: 'grid', placeItems: 'center', padding: 20, backdropFilter: 'blur(5px)' }} onMouseDown={(event) => { if (event.target === event.currentTarget) setShowConfirmation(false) }}><div className="card stack" style={{ width: 'min(560px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}><div><h2>Rundmail wirklich versenden?</h2><div className="muted">Bitte prüfe die Angaben ein letztes Mal.</div></div><div className="warning"><div><strong>Betreff:</strong> {subject}</div><div style={{ marginTop: 8 }}><strong>Empfänger:</strong> {selectedIds.length}</div><div style={{ marginTop: 8 }}><strong>Auswahl:</strong> {selectedCustomers.map((customer) => customer.name).join(', ')}</div></div><div className="actions"><button type="button" className="btn secondary" onClick={() => setShowConfirmation(false)}>Abbrechen</button><button type="button" className="btn primary" onClick={sendCampaign}>{selectedIds.length} E-Mails jetzt versenden</button></div></div></div>}
    </div>
  )
}
