import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { generateInvoicePdf } from '@/lib/invoice-pdf'

export const runtime = 'nodejs'

console.log('🔥 ICLOUD-NODEMAILER-ROUTE AKTIV')

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Nicht angemeldet.' },
        { status: 401 }
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Keine Berechtigung.' },
        { status: 403 }
      )
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || 587)
    const smtpUser = process.env.SMTP_USER
    const smtpPassword = process.env.SMTP_PASSWORD
    const smtpFromName = process.env.SMTP_FROM_NAME || 'Juliet Obazee'

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return NextResponse.json(
        {
          error:
            'SMTP_HOST, SMTP_USER oder SMTP_PASSWORD fehlt in der Umgebung.',
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
        {
          error:
            invoiceError?.message || 'Rechnung nicht gefunden.',
        },
        { status: 404 }
      )
    }

    const snapshot = (invoice.snapshot ?? {}) as Record<string, any>
    const company = snapshot.company ?? {}
    const lineItems = Array.isArray(snapshot.lineItems)
      ? snapshot.lineItems
      : []

    const recipient = String(invoice.customer_email || '').trim()

    if (!recipient) {
      return NextResponse.json(
        {
          error:
            'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt.',
        },
        { status: 400 }
      )
    }

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

    const filename =
      `${invoice.invoice_number}_${safeCustomerName}.pdf`

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,

      // Port 587 startet unverschlüsselt und wechselt dann auf STARTTLS.
      secure: smtpPort === 465,

      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },

      requireTLS: smtpPort === 587,
    })

    const subject =
      `ICLOUD TEST 999 – Rechnung ${invoice.invoice_number} – ${invoice.customer_name}`

    const ownerName =
      company.owner_name ||
      company.company_name ||
      smtpFromName

    const result = await transporter.sendMail({
      from: {
        name: smtpFromName,
        address: smtpUser,
      },

      to: recipient,

      replyTo: company.email || smtpUser,

      subject,

      text: [
        `Guten Tag ${invoice.customer_name},`,
        '',
        `anbei erhalten Sie die Rechnung ${invoice.invoice_number}.`,
        '',
        `Der Rechnungsbetrag beträgt ${Number(invoice.total).toLocaleString(
          'de-DE',
          {
            style: 'currency',
            currency: 'EUR',
          }
        )}.`,
        '',
        'Die Rechnung finden Sie als PDF im Anhang.',
        '',
        'Vielen Dank für Ihren Auftrag.',
        '',
        `Freundliche Grüße`,
        ownerName,
      ].join('\n'),

      html: `
        <div
          style="
            max-width:600px;
            font-family:Arial,Helvetica,sans-serif;
            line-height:1.6;
            color:#172033;
          "
        >
          <p>Guten Tag ${escapeHtml(invoice.customer_name)},</p>

          <p>
            anbei erhalten Sie die Rechnung
            <strong>${escapeHtml(String(invoice.invoice_number))}</strong>.
          </p>

          <p>
            Der Rechnungsbetrag beträgt
            <strong>
              ${Number(invoice.total).toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
            </strong>.
          </p>

          <p>
            Die Rechnung finden Sie als PDF im Anhang.
          </p>

          <p>Vielen Dank für Ihren Auftrag.</p>

          <p>
            Freundliche Grüße<br>
            <strong>${escapeHtml(ownerName)}</strong>
          </p>
        </div>
      `,

      attachments: [
        {
          filename,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    })

    return NextResponse.json({
      ok: true,
      id: result.messageId,
      recipient,
    })
  } catch (error) {
    console.error('Fehler beim Rechnungsversand:', error)

    const message =
      error instanceof Error
        ? error.message
        : 'Unbekannter Fehler beim E-Mail-Versand.'

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    )
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}