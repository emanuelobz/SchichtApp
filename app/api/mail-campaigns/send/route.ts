import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Customer = {
  id: string
  name: string
  email: string | null
}

type SendResult = {
  customerId: string
  customerName: string
  email: string
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

    const body = (await request.json()) as {
      subject?: string
      message?: string
      customerIds?: string[]
    }

    const subject = String(body.subject || '').trim()
    const message = String(body.message || '').trim()
    const customerIds = Array.isArray(body.customerIds)
      ? [...new Set(body.customerIds.map(String))]
      : []

    if (!subject || !message || customerIds.length === 0) {
      return NextResponse.json(
        { error: 'Betreff, Nachricht und mindestens ein Empfänger sind erforderlich.' },
        { status: 400 }
      )
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || 587)
    const smtpUser = process.env.SMTP_USER
    const smtpPassword = process.env.SMTP_PASSWORD
    const smtpFromName = process.env.SMTP_FROM_NAME || 'Juliet Obazee'

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return NextResponse.json(
        { error: 'SMTP_HOST, SMTP_USER oder SMTP_PASSWORD fehlt in der Umgebung.' },
        { status: 500 }
      )
    }

    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('id,name,email')
      .in('id', customerIds)
      .eq('active', true)

    if (customerError) {
      return NextResponse.json({ error: customerError.message }, { status: 500 })
    }

    const customers = (customerData || []) as Customer[]
    const validCustomers = customers.filter((customer) => customer.email?.trim())

    if (validCustomers.length === 0) {
      return NextResponse.json(
        { error: 'Keiner der ausgewählten Kunden hat eine E-Mail-Adresse.' },
        { status: 400 }
      )
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('mail_campaigns')
      .insert({
        subject,
        message,
        status: 'sending',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: campaignError?.message || 'Rundmail konnte nicht gespeichert werden.' },
        { status: 500 }
      )
    }

    const recipientRows = validCustomers.map((customer) => ({
      campaign_id: campaign.id,
      customer_id: customer.id,
      customer_name: customer.name,
      email: String(customer.email).trim(),
      status: 'pending',
    }))

    const { data: recipients, error: recipientError } = await supabase
      .from('mail_recipients')
      .insert(recipientRows)
      .select('id,customer_id,email')

    if (recipientError) {
      await supabase
        .from('mail_campaigns')
        .update({ status: 'failed' })
        .eq('id', campaign.id)

      return NextResponse.json({ error: recipientError.message }, { status: 500 })
    }

    const recipientIdByCustomer = new Map(
      (recipients || []).map((recipient) => [recipient.customer_id, recipient.id])
    )

    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('owner_name,company_name,email,address,postal_code,city')
      .eq('id', 1)
      .maybeSingle()

    const senderName =
      companySettings?.owner_name || companySettings?.company_name || smtpFromName

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      requireTLS: smtpPort === 587,
    })

    const results: SendResult[] = []

    for (const customer of validCustomers) {
      const email = String(customer.email).trim()
      const recipientId = recipientIdByCustomer.get(customer.id)
      const personalizedMessage = message.replaceAll('{{Kundenname}}', customer.name)
      const completeText = `${personalizedMessage}\n${senderName}`

      if (recipientId) {
        await supabase
          .from('mail_recipients')
          .update({ status: 'sending' })
          .eq('id', recipientId)
      }

      try {
        await transporter.sendMail({
          from: {
            name: smtpFromName,
            address: smtpUser,
          },
          to: email,
          replyTo: companySettings?.email || smtpUser,
          subject,
          text: completeText,
          html: renderEmailHtml({
            subject,
            message: personalizedMessage,
            senderName,
            senderEmail: companySettings?.email || smtpUser,
            address: [
              companySettings?.address,
              [companySettings?.postal_code, companySettings?.city].filter(Boolean).join(' '),
            ].filter(Boolean).join(', '),
          }),
        })

        if (recipientId) {
          await supabase
            .from('mail_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error_message: null,
            })
            .eq('id', recipientId)
        }

        results.push({
          customerId: customer.id,
          customerName: customer.name,
          email,
          success: true,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unbekannter Versandfehler.'

        if (recipientId) {
          await supabase
            .from('mail_recipients')
            .update({
              status: 'failed',
              error_message: errorMessage,
            })
            .eq('id', recipientId)
        }

        results.push({
          customerId: customer.id,
          customerName: customer.name,
          email,
          success: false,
          error: errorMessage,
        })
      }
    }

    const sent = results.filter((result) => result.success).length
    const failed = results.length - sent

    await supabase
      .from('mail_campaigns')
      .update({
        status: failed === 0 ? 'sent' : 'failed',
        sent_at: sent > 0 ? new Date().toISOString() : null,
      })
      .eq('id', campaign.id)

    return NextResponse.json({
      ok: failed === 0,
      campaignId: campaign.id,
      total: results.length,
      sent,
      failed,
      results,
    })
  } catch (error) {
    console.error('Fehler beim Rundmail-Versand:', error)

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unbekannter Fehler beim Rundmail-Versand.',
      },
      { status: 500 }
    )
  }
}

function renderEmailHtml(input: {
  subject: string
  message: string
  senderName: string
  senderEmail: string
  address?: string
}) {
  const paragraphs = escapeHtml(input.message)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 18px;white-space:pre-line;">${paragraph}</p>`)
    .join('')

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8;padding:28px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.08);">
        <tr><td style="padding:26px 32px;background:#172033;color:#ffffff;">
          <div style="font-size:13px;opacity:.75;margin-bottom:7px;">${escapeHtml(input.senderName)}</div>
          <div style="font-size:23px;font-weight:700;line-height:1.25;">${escapeHtml(input.subject)}</div>
        </td></tr>
        <tr><td style="padding:34px 32px;font-size:16px;line-height:1.7;">${paragraphs}<p style="margin:4px 0 0;font-weight:700;">${escapeHtml(input.senderName)}</p></td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e8edf3;color:#64748b;font-size:13px;line-height:1.55;">
          <strong style="color:#334155;">${escapeHtml(input.senderName)}</strong><br>
          ${input.address ? `${escapeHtml(input.address)}<br>` : ''}
          ${escapeHtml(input.senderEmail)}
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
