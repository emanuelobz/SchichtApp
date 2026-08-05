import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InvoiceActions from '../InvoiceActions'

const euro = (value: number) =>
  Number(value).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  })

const quantity = (value: number) =>
  Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })

const deDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const splitAddress = (address?: string | null) => {
  if (!address) return []

  const firstComma = address.indexOf(',')
  if (firstComma === -1) return [address]

  return [
    address.slice(0, firstComma).trim(),
    address.slice(firstComma + 1).trim(),
  ].filter(Boolean)
}

type LineItem = {
  position: number
  description: string
  date?: string
  quantity: number
  unitPrice: number
  total: number
}

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/mutter')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  if (!invoice) notFound()

  const snapshot = invoice.snapshot as Record<string, any> | null
  const company = snapshot?.company ?? {}
  const customer = snapshot?.customer ?? {}
  const lineItems = (snapshot?.lineItems ?? []) as LineItem[]
  const customerAddressLines = splitAddress(
    invoice.customer_address || customer.address
  )
  const customerEmail = invoice.customer_email || customer.email || ''
  const emptyRows = Array.from({
    length: Math.max(0, 5 - lineItems.length),
  })

  const companyDisplayName =
    company.company_name || company.owner_name || 'Rechnungsaussteller'

  return (
    <main className="invoiceScreen">
      <InvoiceActions invoiceId={invoice.id} />

      <article className="invoicePaper">
        <div className="invoiceDocument">
          <header className="invoiceLetterHead">
            <section className="invoiceRecipientBlock">
              <strong>{invoice.customer_name}</strong>
              {customerAddressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </section>

            <section className="invoiceMetaBlock" aria-label="Rechnungsdaten">
              <div>
                <span>Rechnungs-Nr.:</span>
                <strong>{invoice.invoice_number}</strong>
              </div>
              <div>
                <span>Rechnungsdatum:</span>
                <strong>{deDate(invoice.invoice_date)}</strong>
              </div>
              <div>
                <span>Leistungszeitraum:</span>
                <strong>{invoice.service_period}</strong>
              </div>
              <div>
                <span>Kunde:</span>
                <strong>{invoice.customer_name}</strong>
              </div>
              {customerEmail && (
                <div>
                  <span>Kunde E-Mail:</span>
                  <strong className="invoiceEmail">{customerEmail}</strong>
                </div>
              )}
            </section>
          </header>

          <div className="invoiceNumberBar">
            <div>
              <strong>Rechnungs-Nr.:</strong>
              <b>{invoice.invoice_number}</b>
            </div>
            <time dateTime={invoice.invoice_date}>
              {deDate(invoice.invoice_date)}
            </time>
          </div>

          <div className="invoiceBody">
            <section className="invoiceIntro">
              <p>Sehr geehrte/r Kunde,</p>
              <p>
                vielen Dank für Ihren Auftrag und das damit verbundene
                Vertrauen!
                <br />
                Hiermit stelle ich Ihnen folgende Leistungen in Rechnung:
              </p>
            </section>

            <section className="invoicePeriodRow">
              <strong>Berechnung für den Zeitraum vom:</strong>
              <b>{invoice.service_period}</b>
            </section>

            <table className="invoiceTable">
              <colgroup>
                <col className="invoiceColPosition" />
                <col className="invoiceColDescription" />
                <col className="invoiceColQuantity" />
                <col className="invoiceColPrice" />
                <col className="invoiceColTotal" />
              </colgroup>
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Beschreibung</th>
                  <th>Menge</th>
                  <th>Einzelpreis</th>
                  <th>Gesamtpreis</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={`${item.position}-${item.date ?? ''}`}>
                    <td>{item.position}.</td>
                    <td>{item.description}</td>
                    <td>{quantity(item.quantity)}</td>
                    <td>{euro(item.unitPrice)}</td>
                    <td>{euro(item.total)}</td>
                  </tr>
                ))}

                {emptyRows.map((_, index) => (
                  <tr className="invoiceEmptyRow" key={`empty-${index}`}>
                    <td>…</td>
                    <td>…</td>
                    <td>–</td>
                    <td />
                    <td>–</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Gesamtbetrag netto:</td>
                  <td>{euro(invoice.total)}</td>
                </tr>
                <tr>
                  <td colSpan={4}>Gesamtbetrag brutto:</td>
                  <td>{euro(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>

            <section className="invoiceText">
              <p>
                Ich bitte um <strong>Überweisung</strong> des Rechnungsbetrages{' '}
                <strong>
                  innerhalb von {company.payment_days || 7} Tagen
                </strong>{' '}
                nach Rechnungsdatum an IBAN:
                <br />
                <strong>{company.iban}</strong>
                {company.bank_name ? ` (${company.bank_name})` : ''}
              </p>

              {company.small_business && (
                <p>
                  Der Rechnungsaussteller ist Kleinunternehmer im Sinne des § 19
                  UStG und weist daher <strong>keine Umsatzsteuer</strong> aus.
                </p>
              )}

              <p className="invoiceLegalNotice">
                Gesetzlich vorgeschriebener Hinweis: Sie kommen automatisch ohne
                weitere Mahnung in Verzug, wenn Sie nicht innerhalb von 30 Tagen
                nach Fälligkeit und Zugang dieser Rechnung bezahlen (§ 286 Abs. 3
                BGB).
              </p>

              <p className="invoiceClosing">
                Vielen Dank für Ihren Auftrag,
                <br />
                <strong>{company.owner_name || companyDisplayName}</strong>
              </p>
            </section>
          </div>

          <footer className="invoiceFooter">
            <div>
              <strong>{companyDisplayName}</strong>
              <span>{company.address}</span>
              <span>
                {company.postal_code} {company.city}
              </span>
              <span>{company.email}</span>
            </div>

            <div>
              <strong>{company.bank_name}</strong>
              <span>IBAN {company.iban}</span>
              <span>BIC {company.bic}</span>
            </div>

            <div>
              <strong>Steuernummer: {company.tax_number}</strong>
              {company.owner_name && <span>{company.owner_name}</span>}
            </div>
          </footer>
        </div>
      </article>
    </main>
  )
}
