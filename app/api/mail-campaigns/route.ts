import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    const { data, error } = await supabase
      .from('mail_campaigns')
      .select(`
        id,
        subject,
        message,
        status,
        created_at,
        sent_at,
        mail_recipients (
          id,
          customer_name,
          email,
          status,
          sent_at,
          error_message
        )
      `)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const campaigns = (data || []).map((campaign) => ({
      id: campaign.id,
      subject: campaign.subject,
      message: campaign.message,
      status: campaign.status,
      created_at: campaign.created_at,
      sent_at: campaign.sent_at,
      recipients: campaign.mail_recipients || [],
    }))

    return NextResponse.json({ campaigns })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Historie konnte nicht geladen werden.' }, { status: 500 })
  }
}
