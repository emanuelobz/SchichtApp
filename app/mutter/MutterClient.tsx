'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LogoutButton from '@/components/LogoutButton'

type Customer = {
  id: string
  name: string
  hourly_rate: number
}

type Entry = {
  id: string
  work_date: string
  hours: number
  notes?: string | null
  customer_id?: string
  billed_rate?: number | null
  customers: { name: string } | null
}

type QuickDate = 'today' | 'yesterday' | 'dayBefore' | null

const hourOptions = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

const iso = (date: Date) => {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  )

  return local.toISOString().slice(0, 10)
}

const niceDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const shortDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })

export default function MutterClient({
  displayName,
  customers,
  initialEntries,
}: {
  displayName: string
  customers: Customer[]
  initialEntries: Entry[]
}) {
  const today = iso(new Date())

  const [query, setQuery] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(today)
  const [hours, setHours] = useState(2)
  const [customHours, setCustomHours] = useState('')
  const [notes, setNotes] = useState('')

  const [hoursStepOpen, setHoursStepOpen] = useState(false)
  const [hoursConfirmed, setHoursConfirmed] = useState(false)

  const [entries, setEntries] = useState(initialEntries)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<Entry | null>(null)

  const [entriesOpen, setEntriesOpen] = useState(false)

  const [customerStepOpen, setCustomerStepOpen] = useState(true)
  const [dateStepOpen, setDateStepOpen] = useState(false)
  const [dateConfirmed, setDateConfirmed] = useState(false)
  const [quickDateSelection, setQuickDateSelection] =
    useState<QuickDate>(null)

  const selected = customers.find((customer) => customer.id === customerId)

  const usage = useMemo(() => {
    const map = new Map<string, number>()

    entries.forEach((entry) => {
      const name = entry.customers?.name

      if (name) {
        map.set(name, (map.get(name) || 0) + 1)
      }
    })

    return map
  }, [entries])

  const filtered = useMemo(
    () =>
      customers
        .filter((customer) =>
          customer.name
            .toLocaleLowerCase('de')
            .includes(query.toLocaleLowerCase('de'))
        )
        .sort(
          (a, b) =>
            (usage.get(b.name) || 0) -
              (usage.get(a.name) || 0) ||
            a.name.localeCompare(b.name, 'de')
        ),
    [customers, query, usage]
  )

  const finalHours = customHours
    ? Number(customHours.replace(',', '.'))
    : hours

  function selectCustomer(id: string) {
  setCustomerId(id)
  setMsg('')
  setCustomerStepOpen(false)
  setDateStepOpen(true)
  setHoursStepOpen(false)
  setHoursConfirmed(false)
  }

  function quickDate(offset: number, selection: QuickDate) {
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + offset)

  setDate(iso(nextDate))
  setQuickDateSelection(selection)
  setDateConfirmed(true)
  setDateStepOpen(false)

  setHoursConfirmed(false)
  setHoursStepOpen(true)

  setMsg('')
  navigator.vibrate?.(25)
  }

  function selectManualDate(value: string) {
  setDate(value)
  setQuickDateSelection(null)
  setDateConfirmed(true)
  setDateStepOpen(false)

  setHoursConfirmed(false)
  setHoursStepOpen(true)

  setMsg('')
  }

  function resetForm() {
    setCustomerId('')
    setQuery('')
    setHours(2)
    setCustomHours('')
    setNotes('')
    setDate(today)

    setCustomerStepOpen(true)
    setDateStepOpen(false)
    setDateConfirmed(false)
    setQuickDateSelection(null)

    setHoursStepOpen(false)
    setHoursConfirmed(false)
  } 

  async function save() {
    if (!customerId) {
      setMsg('Bitte zuerst einen Kunden auswählen.')
      setCustomerStepOpen(true)
      return
    }

    if (!dateConfirmed) {
      setMsg('Bitte zuerst ein Datum auswählen.')
      setDateStepOpen(true)
      return
    }

    if (!finalHours || finalHours <= 0 || finalHours > 24) {
      setMsg('Bitte eine gültige Stundenzahl eingeben.')
      return
    }

    if (
      date > today &&
      !confirm('Das Datum liegt in der Zukunft. Trotzdem speichern?')
    ) {
      return
    }

    setLoading(true)
    setMsg('')

    const supabase = createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      setMsg('Die Sitzung ist abgelaufen. Bitte neu anmelden.')
      return
    }

    const payload = {
      worker_id: user.id,
      customer_id: customerId,
      work_date: date,
      hours: finalHours,
      notes: notes.trim() || null,
      billed_rate: Number(selected?.hourly_rate || 0),
    }

    const { data, error } = await supabase
      .from('work_entries')
      .insert(payload)
      .select(
        'id,work_date,hours,notes,customer_id,billed_rate,customers(name)'
      )
      .single()

    setLoading(false)

    if (error) {
      setMsg(
        error.code === '23505'
          ? 'Für diesen Kunden ist an diesem Datum bereits ein Eintrag vorhanden.'
          : `Fehler: ${error.message}`
      )
      return
    }

    setEntries((currentEntries) => [
      data as unknown as Entry,
      ...currentEntries,
    ])

    resetForm()
    setMsg('Eintrag wurde gespeichert ✓')

    navigator.vibrate?.(40)
  }

  function startEdit(entry: Entry) {
    setEditing(entry)
  }

  async function updateEntry() {
    if (!editing) return

    const supabase = createClient()

    const { data, error } = await supabase
      .from('work_entries')
      .update({
        work_date: editing.work_date,
        hours: Number(editing.hours),
        notes: editing.notes || null,
      })
      .eq('id', editing.id)
      .select(
        'id,work_date,hours,notes,customer_id,billed_rate,customers(name)'
      )
      .single()

    if (error) {
      alert(
        error.code === '23505'
          ? 'Für diesen Kunden gibt es an diesem Datum schon einen Eintrag.'
          : error.message
      )
      return
    }

    setEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === editing.id
          ? (data as unknown as Entry)
          : entry
      )
    )

    setEditing(null)
  }

  async function remove(id: string) {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return

    const supabase = createClient()

    const { error } = await supabase
      .from('work_entries')
      .delete()
      .eq('id', id)

    if (!error) {
      setEntries((currentEntries) =>
        currentEntries.filter((entry) => entry.id !== id)
      )
    }
  }

  return (
    <main className="shell narrow motherShell">
      <header className="motherHeader">
        <div>
          <div className="eyebrow">SchichtApp</div>
          <h1>
            Hey {displayName === 'juliet.obazee' ? 'Mama 🤍' : displayName}
            </h1>

            {displayName === 'juliet.obazee' && (
            <div className="motherMotivation">
                Your hard work never goes unnoticed.
            </div>
            )}
        </div>

        <div className="motherLogout">
          <LogoutButton />
        </div>
      </header>

      <section className="card motherForm">
        <div
          className={`motherStep ${
            customerId && !customerStepOpen
              ? 'motherStepComplete'
              : ''
          }`}
        >
          <button
            type="button"
            className="motherStepHeader"
            onClick={() => setCustomerStepOpen(true)}
          >
            <span className="motherStepNumber">
              {customerId ? '✓' : '1'}
            </span>

            <span className="motherStepHeading">
              <strong>Kunde</strong>

              <small>
                {selected
                  ? selected.name
                  : 'Für wen hast du gearbeitet?'}
              </small>
            </span>

            {customerId && !customerStepOpen && (
              <span className="motherChange">Ändern</span>
            )}
          </button>

          {customerStepOpen && (
            <div className="motherStepContent">
              <div className="field">
                <input
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                  placeholder="Kunden suchen …"
                  autoComplete="off"
                  autoFocus={!customerId}
                />
              </div>

              <div className="customerList motherCustomerList">
                {filtered.map((customer) => (
                  <button
                    type="button"
                    key={customer.id}
                    className={`customerBtn ${
                      customerId === customer.id
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      selectCustomer(customer.id)
                    }
                  >
                    <span>{customer.name}</span>

                    <small>
                      {Number(
                        customer.hourly_rate
                      ).toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      })}{' '}
                      pro Stunde
                    </small>
                  </button>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="empty">
                  Kein Kunde gefunden.
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className={`motherStep ${
            dateConfirmed && !dateStepOpen
              ? 'motherStepComplete'
              : ''
          } ${!customerId ? 'motherStepDisabled' : ''}`}
        >
          <button
            type="button"
            className="motherStepHeader"
            disabled={!customerId}
            onClick={() => {
              if (customerId) setDateStepOpen(true)
            }}
          >
            <span className="motherStepNumber">
              {dateConfirmed ? '✓' : '2'}
            </span>

            <span className="motherStepHeading">
              <strong>Leistungsdatum</strong>

              <small>
                {dateConfirmed
                  ? shortDate(date)
                  : 'An welchem Tag warst du dort?'}
              </small>
            </span>

            {dateConfirmed && !dateStepOpen && (
              <span className="motherChange">Ändern</span>
            )}
          </button>

          {customerId && dateStepOpen && (
            <div className="motherStepContent">
              <div className="quickDates">
                <button
                  type="button"
                  className={`quickDate ${
                    quickDateSelection === 'today'
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => quickDate(0, 'today')}
                >
                  <span>Heute</span>
                  <small>{niceDate(today)}</small>
                </button>

                <button
                  type="button"
                  className={`quickDate ${
                    quickDateSelection === 'yesterday'
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    quickDate(-1, 'yesterday')
                  }
                >
                  <span>Gestern</span>
                  <small>
                    {niceDate(
                      iso(
                        new Date(
                          new Date().setDate(
                            new Date().getDate() - 1
                          )
                        )
                      )
                    )}
                  </small>
                </button>

                <button
                  type="button"
                  className={`quickDate ${
                    quickDateSelection === 'dayBefore'
                      ? 'active'
                      : ''
                  }`}
                  onClick={() =>
                    quickDate(-2, 'dayBefore')
                  }
                >
                  <span>Vorgestern</span>
                  <small>
                    {niceDate(
                      iso(
                        new Date(
                          new Date().setDate(
                            new Date().getDate() - 2
                          )
                        )
                      )
                    )}
                  </small>
                </button>
              </div>

              <div className="motherDateDivider">
                <span>oder anderes Datum</span>
              </div>

              <div className="field">
                <input
                  type="date"
                  value={date}
                  onChange={(event) =>
                    selectManualDate(event.target.value)
                  }
                />
              </div>
            </div>
          )}
        </div>

        {customerId && dateConfirmed && (
            <>
                <div
                className={`motherStep ${
                    hoursConfirmed && !hoursStepOpen
                    ? 'motherStepComplete'
                    : ''
                }`}
                >
                <button
                    type="button"
                    className="motherStepHeader"
                    onClick={() => setHoursStepOpen(true)}
                >
                    <span className="motherStepNumber">
                    {hoursConfirmed ? '✓' : '3'}
                    </span>

                    <span className="motherStepHeading">
                    <strong>Stundenzahl</strong>

                    <small>
                        {hoursConfirmed
                        ? `${String(finalHours).replace('.', ',')} Stunden`
                        : 'Wie lange hast du gearbeitet?'}
                    </small>
                    </span>

                    {hoursConfirmed && !hoursStepOpen && (
                    <span className="motherChange">Ändern</span>
                    )}
                </button>

                {hoursStepOpen && (
                    <div className="motherStepContent">
                    <div className="hours">
                        {hourOptions.map((hour) => (
                        <button
                            type="button"
                            className={`hourBtn ${
                            !customHours && hours === hour
                                ? 'active'
                                : ''
                            }`}
                            onClick={() => {
                            setHours(hour)
                            setCustomHours('')
                            setHoursConfirmed(true)
                            setHoursStepOpen(false)
                            setMsg('')

                            navigator.vibrate?.(25)
                            }}
                            key={hour}
                        >
                            {String(hour).replace('.', ',')}
                            <small>Std.</small>
                        </button>
                        ))}
                    </div>

                    <div className="motherDateDivider">
                        <span>oder andere Stundenzahl</span>
                    </div>

                    <div className="field">
                        <input
                        inputMode="decimal"
                        value={customHours}
                        onChange={(event) => {
                            setCustomHours(event.target.value)
                            setHoursConfirmed(false)
                            setMsg('')
                        }}
                        placeholder="Zum Beispiel 5,5"
                        />
                    </div>

                    {customHours && Number(customHours.replace(',', '.')) > 0 && (
                        <button
                        type="button"
                        className="btn secondary motherConfirmHours"
                        onClick={() => {
                            const value = Number(
                            customHours.replace(',', '.')
                            )

                            if (!value || value <= 0 || value > 24) {
                            setMsg(
                                'Bitte eine gültige Stundenzahl eingeben.'
                            )
                            return
                            }

                            setHoursConfirmed(true)
                            setHoursStepOpen(false)
                            setMsg('')

                            navigator.vibrate?.(25)
                        }}
                        >
                        {customHours.replace('.', ',')} Stunden übernehmen
                        </button>
                    )}
                    </div>
                )}
                </div>

                {hoursConfirmed && (
                <div className="motherDetails">
                    <div className="field">
                    <label>
                        Notiz{' '}
                        <span className="muted">(optional)</span>
                    </label>

                    <textarea
                        value={notes}
                        onChange={(event) =>
                        setNotes(event.target.value)
                        }
                        placeholder="Zum Beispiel: Schlüssel abgegeben"
                    />
                    </div>

                    {selected && (
                    <div className="motherSummary">
                        <div className="motherSummaryIcon">✓</div>

                        <div>
                        <strong>{selected.name}</strong>

                        <span>
                            {niceDate(date)} ·{' '}
                            {String(finalHours).replace('.', ',')}{' '}
                            Stunden
                        </span>
                        </div>
                    </div>
                    )}

                    {msg && (
                    <div
                        className={
                        msg.includes('✓') ? 'success' : 'error'
                        }
                    >
                        {msg}
                    </div>
                    )}

                    <div className="saveBar">
                    <button
                        type="button"
                        className="btn primary"
                        disabled={loading}
                        onClick={save}
                    >
                        {loading
                        ? 'Wird gespeichert …'
                        : 'Eintrag speichern'}
                    </button>
                    </div>
                </div>
                )}
            </>
            )}

        {msg && (!customerId || !dateConfirmed) && (
          <div
            className={
              msg.includes('✓') ? 'success' : 'error'
            }
          >
            {msg}
          </div>
        )}
      </section>

      <section className="card motherEntries">
        <button
            type="button"
            className="motherEntriesToggle"
            onClick={() => setEntriesOpen((open) => !open)}
            aria-expanded={entriesOpen}
        >
            <div>
            <h2>Letzte Einträge</h2>

            <div className="muted">
                {entriesOpen
                ? 'Tippe erneut, um die Liste zu schließen.'
                : 'Tippe hier, um frühere Einträge zu sehen.'}
            </div>
            </div>

            <div className="motherEntriesToggleRight">
            <span className="badge">{entries.length}</span>

            <span
                className={`motherEntriesArrow ${
                entriesOpen ? 'open' : ''
                }`}
            >
                ↓
            </span>
            </div>
        </button>

        {entriesOpen && (
            <div className="entryList motherEntriesList">
            {entries.length === 0 ? (
                <div className="empty">
                Noch keine Einträge.
                </div>
            ) : (
                entries.slice(0, 30).map((entry) => (
                <div className="entry" key={entry.id}>
                    <div className="entryMain">
                    <div className="entryTitle">
                        {entry.customers?.name}
                    </div>

                    <div className="entryMeta">
                        {niceDate(entry.work_date)} ·{' '}
                        {String(entry.hours).replace('.', ',')}{' '}
                        Std.
                        {entry.notes
                        ? ` · ${entry.notes}`
                        : ''}
                    </div>
                    </div>

                    <div className="entryActions">
                    <button
                        type="button"
                        className="btn secondary"
                        onClick={() => startEdit(entry)}
                    >
                        Bearbeiten
                    </button>

                    <button
                        type="button"
                        className="btn danger"
                        onClick={() => remove(entry.id)}
                    >
                        Löschen
                    </button>
                    </div>
                </div>
                ))
            )}
            </div>
        )}
        </section>

      {editing && (
        <div
          className="modalBackdrop"
          onClick={() => setEditing(null)}
        >
          <div
            className="card modal stack"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Eintrag bearbeiten</h2>

            <div className="field">
              <label>Datum</label>

              <input
                type="date"
                value={editing.work_date}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    work_date: event.target.value,
                  })
                }
              />
            </div>

            <div className="field">
              <label>Stunden</label>

              <input
                inputMode="decimal"
                value={String(editing.hours).replace(
                  '.',
                  ','
                )}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    hours: Number(
                      event.target.value.replace(',', '.')
                    ),
                  })
                }
              />
            </div>

            <div className="field">
              <label>Notiz</label>

              <textarea
                value={editing.notes || ''}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    notes: event.target.value,
                  })
                }
              />
            </div>

            <div className="actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditing(null)}
              >
                Abbrechen
              </button>

              <button
                type="button"
                className="btn primary"
                onClick={updateEntry}
              >
                Änderung speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}