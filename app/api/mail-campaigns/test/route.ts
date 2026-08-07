import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })

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
      email?: string
      customerName?: string
    }

    const subject = String(body.subject || '').trim()
    const message = String(body.message || '').trim()
    const email = String(body.email || '').trim()
    const customerName = String(body.customerName || 'Testkunde').trim()

    if (!subject || !message || !email || !email.includes('@')) {
      return NextResponse.json({ error: 'Betreff, Nachricht und gültige E-Mail sind erforderlich.' }, { status: 400 })
    }

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || 587)
    const smtpUser = process.env.SMTP_USER
    const smtpPassword = process.env.SMTP_PASSWORD
    const smtpFromName = process.env.SMTP_FROM_NAME || 'Juliet Obazee'

    if (!smtpHost || !smtpUser || !smtpPassword) {
      return NextResponse.json({ error: 'SMTP-Konfiguration fehlt.' }, { status: 500 })
    }

    const { data: settings } = await supabase
      .from('company_settings')
      .select('owner_name,company_name,email,address,postal_code,city')
      .eq('id', 1)
      .maybeSingle()

    const senderName = settings?.owner_name || settings?.company_name || smtpFromName
    const personalizedMessage = message.replaceAll('{{Kundenname}}', customerName)
    const completeText = `${personalizedMessage}\n${senderName}`

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
      requireTLS: smtpPort === 587,
    })

    await transporter.sendMail({
      from: { name: smtpFromName, address: smtpUser },
      to: email,
      replyTo: settings?.email || smtpUser,
      subject: `[TEST] ${subject}`,
      text: completeText,
      html: renderEmailHtml({
        subject: `[TEST] ${subject}`,
        message: personalizedMessage,
        senderName,
        senderEmail: settings?.email || smtpUser,
        address: [settings?.address, [settings?.postal_code, settings?.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        isTest: true,
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Fehler beim Testmail-Versand:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Testmail konnte nicht gesendet werden.' }, { status: 500 })
  }
}

function renderEmailHtml(input: {
  subject: string
  message: string
  senderName: string
  senderEmail: string
  address?: string
  isTest?: boolean
}) {
  const paragraphs = escapeHtml(input.message)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 18px;white-space:pre-line;">${paragraph}</p>`)
    .join('')

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8;padding:28px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,.08);">
        <tr><td style="padding:26px 32px;background:#172033;color:#ffffff;">
          <div style="font-size:13px;opacity:.75;margin-bottom:7px;">${input.isTest ? 'TESTMAIL · ' : ''}${escapeHtml(input.senderName)}</div>
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
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}
