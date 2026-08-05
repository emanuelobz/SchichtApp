import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MutterClient from './MutterClient'
export default async function MutterPage(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login')
 const [{data:profile},{data:customers},{data:entries}]=await Promise.all([
  supabase.from('profiles').select('role,display_name').eq('id',user.id).single(),
  supabase.from('customers').select('id,name,hourly_rate,active').eq('active',true).order('name'),
  supabase.from('work_entries').select('id,customer_id,work_date,hours,billed_rate,notes,customers(name)').eq('worker_id',user.id).order('work_date',{ascending:false}).limit(30)
 ])
 if(profile?.role==='admin')redirect('/admin')
 return <MutterClient displayName={profile?.display_name||'Mama'} customers={(customers||[]) as any} initialEntries={(entries||[]) as any}/>
}
