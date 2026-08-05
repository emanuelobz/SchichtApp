'use client'
import { createClient } from '@/lib/supabase/client'
export default function LogoutButton(){return <button className="btn secondary" onClick={async()=>{await createClient().auth.signOut();location.href='/login'}}>Abmelden</button>}
