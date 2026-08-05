import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/mutter')

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: entries }, { data: customers }, { data: workers }, { data: settings }, { data: invoices }] =
    await Promise.all([
      supabase
        .from('work_entries')
        .select('id,worker_id,customer_id,work_date,hours,billed_rate,notes,customers(name,hourly_rate)')
        .gte('work_date', `${month}-01`)
        .lt('work_date', end)
        .order('work_date', { ascending: false }),
      supabase
        .from('customers')
        .select('id,name,hourly_rate,active,address,email,price_tier,travel_minutes,kilometers,service_location,invoice_description,notes')
        .order('name'),
      supabase
        .from('profiles')
        .select('id,display_name,role')
        .eq('role', 'worker')
        .order('display_name'),
      supabase.from('company_settings').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('invoices')
        .select('id,invoice_number,invoice_date,service_period,customer_name,total,status,created_at')
        .order('invoice_number', { ascending: false })
        .limit(100),
    ])

  return (
    <AdminClient
      displayName={profile.display_name || 'Admin'}
      initialEntries={(entries || []) as any}
      customers={(customers || []) as any}
      workers={(workers || []) as any}
      initialSettings={(settings || null) as any}
      initialInvoices={(invoices || []) as any}
    />
  )
}
