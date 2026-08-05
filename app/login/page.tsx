'use client'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
export default function Login(){
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [msg,setMsg]=useState(''); const [loading,setLoading]=useState(false); const router=useRouter()
 async function submit(e:FormEvent){e.preventDefault();setLoading(true);setMsg('');const supabase=createClient();const {error}=await supabase.auth.signInWithPassword({email,password});setLoading(false);if(error){setMsg('Login fehlgeschlagen: '+error.message);return}router.replace('/');router.refresh()}
 return <main className="shell" style={{maxWidth:480,paddingTop:80}}><div className="card stack"><div><h1 style={{marginBottom:6}}>SchichtApp</h1><p className="muted">Einloggen und loslegen.</p></div><form className="stack" onSubmit={submit}><div className="field"><label>E-Mail</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div><div className="field"><label>Passwort</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>{msg&&<div className="error">{msg}</div>}<button className="btn primary" disabled={loading}>{loading?'Anmelden…':'Anmelden'}</button></form></div></main>
}
