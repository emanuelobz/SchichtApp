import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type SendResult = {
  invoiceId: string
  invoiceNumber: number
  customerName: string
  recipient?: string
  success: boolean
  error?: string
}

export async function POST(request: Request) {
  try {
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

    const body = (await request.json()) as {
      month?: string
    }

    const month = String(body.month || '').trim()

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Ungültiger Abrechnungsmonat.' },
        { status: 400 }
      )
    }

    const { data: invoices, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        customer_name,
        customer_email,
        status,
        service_month
      `)
      .eq('service_month', month)
      .eq('status', 'created')
      .order('invoice_number', { ascending: true })

    if (invoiceError) {
      return NextResponse.json(
        { error: invoiceError.message },
        { status: 500 }
      )
    }

    const openInvoices = invoices || []

    if (openInvoices.length === 0) {
      return NextResponse.json({
        ok: true,
        month,
        total: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        sentIds: [],
        results: [],
        message:
          'Für diesen Monat gibt es keine unversendeten Rechnungen.',
      })
    }

    const results: SendResult[] = []
    const sentIds: string[] = []

    const cookie = request.headers.get('cookie') || ''
    const origin = new URL(request.url).origin

    for (const invoice of openInvoices) {
      const recipient = String(invoice.customer_email || '').trim()

      if (!recipient) {
        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          success: false,
          error: 'Keine Kunden-E-Mail-Adresse hinterlegt.',
        })

        continue
      }

      try {
        /*
         * Wir verwenden für jede Rechnung die bereits funktionierende
         * Einzelversand-Route. Dadurch bleiben PDF, Mailtext, iCloud-SMTP
         * und Statusänderung an einer zentralen Stelle.
         */
        const response = await fetch(
          `${origin}/api/invoices/${invoice.id}/send-test`,
          {
            method: 'POST',
            headers: {
              cookie,
            },
            cache: 'no-store',
          }
        )

        const result = (await response.json()) as {
          error?: string
          recipient?: string
        }

        if (!response.ok) {
          results.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            recipient,
            success: false,
            error:
              result.error ||
              'Die Rechnung konnte nicht gesendet werden.',
          })

          continue
        }

        sentIds.push(invoice.id)

        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          recipient: result.recipient || recipient,
          success: true,
        })
      } catch (error) {
        results.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer_name,
          recipient,
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unbekannter Fehler beim Versand.',
        })
      }
    }

    const sent = results.filter((result) => result.success).length

    const skipped = results.filter(
      (result) =>
        !result.success &&
        result.error === 'Keine Kunden-E-Mail-Adresse hinterlegt.'
    ).length

    const failed = results.filter(
      (result) =>
        !result.success &&
        result.error !== 'Keine Kunden-E-Mail-Adresse hinterlegt.'
    ).length

    return NextResponse.json({
      ok: failed === 0,
      month,
      total: openInvoices.length,
      sent,
      failed,
      skipped,
      sentIds,
      results,
    })
  } catch (error) {
    console.error('Fehler beim Monatsversand:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unbekannter Fehler beim Monatsversand.',
      },
      { status: 500 }
    )
  }
}