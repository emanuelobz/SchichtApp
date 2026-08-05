import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoicePdf } from '@/lib/invoice-pdf'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 })
  }

  const apiKey = process.env.RESEND_API_KEY
  const testEmail = process.env.RESEND_TEST_EMAIL

  if (!apiKey || !testEmail) {
    return NextResponse.json(
      {
        error:
          'RESEND_API_KEY oder RESEND_TEST_EMAIL fehlt in der Umgebung.',
      },
      { status: 500 }
    )
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { error: invoiceError?.message || 'Rechnung nicht gefunden.' },
      { status: 404 }
    )
  }

  const snapshot = (invoice.snapshot ?? {}) as Record<string, any>
  const company = snapshot.company ?? {}
  const lineItems = Array.isArray(snapshot.lineItems) ? snapshot.lineItems : []

  const pdf = generateInvoicePdf({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoice.invoice_date,
    servicePeriod: invoice.service_period,
    customerName: invoice.customer_name,
    customerAddress: invoice.customer_address,
    customerEmail: invoice.customer_email,
    total: Number(invoice.total),
    lineItems,
    company,
  })

  const safeCustomerName = String(invoice.customer_name)
    .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const filename = `${invoice.invoice_number}_${safeCustomerName}.pdf`
  const subject = `Test – Rechnung ${invoice.invoice_number} – ${invoice.customer_name}`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${company.owner_name || 'SchichtApp'} <onboarding@resend.dev>`,
      to: [testEmail],
      reply_to: company.email || undefined,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033">
          <p>Hallo,</p>
          <p>anbei kommt die Testversion der Rechnung <strong>${invoice.invoice_number}</strong> für <strong>${invoice.customer_name}</strong>.</p>
          <p>Bitte PDF, Kundendaten, Rechnungsbetrag, IBAN und Seitenlayout kontrollieren.</p>
          <p>Diese Testmail wurde noch nicht als Kundenversand markiert.</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdf.toString('base64'),
        },
      ],
    }),
  })

  const result = (await response.json()) as {
    id?: string
    message?: string
    name?: string
    error?: string
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: result.message || result.error || 'Resend-Fehler.' },
      { status: response.status }
    )
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    recipient: testEmail,
  })
}
