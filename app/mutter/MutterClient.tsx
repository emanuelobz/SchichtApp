'use client'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LogoutButton from '@/components/LogoutButton'

type Customer={id:string;name:string;hourly_rate:number}
type Entry={id:string;work_date:string;hours:number;notes?:string|null;customer_id?:string;billed_rate?:number|null;customers:{name:string}|null}
const hourOptions=[1,1.5,2,2.5,3,3.5,4,4.5,5]
const iso=(date:Date)=>{const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,10)}
const niceDate=(value:string)=>new Date(value+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})

export default function MutterClient({displayName,customers,initialEntries}:{displayName:string;customers:Customer[];initialEntries:Entry[]}){
 const today=iso(new Date())
 const [query,setQuery]=useState(''); const [customerId,setCustomerId]=useState(''); const [date,setDate]=useState(today)
 const [hours,setHours]=useState(2); const [customHours,setCustomHours]=useState(''); const [notes,setNotes]=useState('')
 const [entries,setEntries]=useState(initialEntries); const [msg,setMsg]=useState(''); const [loading,setLoading]=useState(false)
 const [editing,setEditing]=useState<Entry|null>(null)
 const selected=customers.find(c=>c.id===customerId)
 const usage=useMemo(()=>{const m=new Map<string,number>();entries.forEach(e=>{const n=e.customers?.name;if(n)m.set(n,(m.get(n)||0)+1)});return m},[entries])
 const filtered=useMemo(()=>customers.filter(c=>c.name.toLocaleLowerCase('de').includes(query.toLocaleLowerCase('de'))).sort((a,b)=>(usage.get(b.name)||0)-(usage.get(a.name)||0)||a.name.localeCompare(b.name,'de')),[customers,query,usage])
 const finalHours=customHours?Number(customHours.replace(',','.')):hours
 function quickDate(offset:number){const d=new Date();d.setDate(d.getDate()+offset);setDate(iso(d))}
 function resetForm(){setCustomerId('');setQuery('');setHours(2);setCustomHours('');setNotes('');setDate(today)}
 async function save(){
  if(!customerId){setMsg('Bitte zuerst einen Kunden auswählen.');return}
  if(!finalHours||finalHours<=0||finalHours>24){setMsg('Bitte eine gültige Stundenzahl eingeben.');return}
  if(date>today&&!confirm('Das Datum liegt in der Zukunft. Trotzdem speichern?'))return
  setLoading(true);setMsg('');const supabase=createClient();const {data:{user}}=await supabase.auth.getUser()
  if(!user){setLoading(false);setMsg('Die Sitzung ist abgelaufen. Bitte neu anmelden.');return}
  const payload={worker_id:user.id,customer_id:customerId,work_date:date,hours:finalHours,notes:notes.trim()||null,billed_rate:Number(selected?.hourly_rate||0)}
  const {data,error}=await supabase.from('work_entries').insert(payload).select('id,work_date,hours,notes,customer_id,billed_rate,customers(name)').single()
  setLoading(false)
  if(error){setMsg(error.code==='23505'?'Für diesen Kunden ist an diesem Datum bereits ein Eintrag vorhanden.':'Fehler: '+error.message);return}
  setEntries([data as unknown as Entry,...entries]);setMsg('Gespeichert ✓');resetForm();navigator.vibrate?.(40)
 }
 function startEdit(e:Entry){setEditing(e)}
 async function updateEntry(){if(!editing)return;const supabase=createClient();const {data,error}=await supabase.from('work_entries').update({work_date:editing.work_date,hours:Number(editing.hours),notes:editing.notes||null}).eq('id',editing.id).select('id,work_date,hours,notes,customer_id,billed_rate,customers(name)').single();if(error){alert(error.code==='23505'?'Für diesen Kunden gibt es an diesem Datum schon einen Eintrag.':error.message);return}setEntries(entries.map(e=>e.id===editing.id?data as unknown as Entry:e));setEditing(null)}
 async function remove(id:string){if(!confirm('Diesen Eintrag wirklich löschen?'))return;const supabase=createClient();const {error}=await supabase.from('work_entries').delete().eq('id',id);if(!error)setEntries(entries.filter(e=>e.id!==id))}
 return <main className="shell narrow">
  <div className="top"><div><div className="eyebrow">SchichtApp</div><h1>Hallo {displayName} 👋</h1><div className="muted">Kunde, Datum und Stunden – fertig.</div></div><LogoutButton/></div>
  <section className="card stack">
   <div className="field"><label>1. Kunde auswählen</label><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Kunden suchen …" autoComplete="off"/></div>
   <div className="customerList">{filtered.map(c=><button type="button" key={c.id} className={`customerBtn ${customerId===c.id?'active':''}`} onClick={()=>setCustomerId(c.id)}><span>{c.name}</span><small>{Number(c.hourly_rate).toLocaleString('de-DE',{style:'currency',currency:'EUR'})} pro Stunde</small></button>)}</div>
   {filtered.length===0&&<div className="empty">Kein Kunde gefunden.</div>}
   <div className="field"><label>2. Leistungsdatum</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><div className="quickDates"><button className="quickDate" type="button" onClick={()=>quickDate(0)}>Heute</button><button className="quickDate" type="button" onClick={()=>quickDate(-1)}>Gestern</button><button className="quickDate" type="button" onClick={()=>quickDate(-2)}>Vorgestern</button></div></div>
   <div className="field"><label>3. Stundenzahl</label><div className="hours">{hourOptions.map(h=><button type="button" className={`hourBtn ${!customHours&&hours===h?'active':''}`} onClick={()=>{setHours(h);setCustomHours('')}} key={h}>{String(h).replace('.',',')} Std.</button>)}</div><input inputMode="decimal" value={customHours} onChange={e=>setCustomHours(e.target.value)} placeholder="Andere Stundenzahl (optional)"/></div>
   <div className="field"><label>Notiz <span className="muted">(optional)</span></label><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Zum Beispiel: Schlüssel abgegeben"/></div>
   {selected&&<div className="success"><strong>{selected.name}</strong><br/>{niceDate(date)} · {String(finalHours).replace('.',',')} Stunden</div>}
   {msg&&<div className={msg.includes('✓')?'success':'error'}>{msg}</div>}
   <div className="saveBar"><button className="btn primary" disabled={loading||!customerId} onClick={save}>{loading?'Wird gespeichert …':'Eintrag speichern'}</button></div>
  </section>
  <div style={{height:18}}/>
  <section className="card"><div className="top" style={{marginBottom:12}}><div><h2 style={{margin:0}}>Letzte Einträge</h2><div className="muted">Fehler lassen sich direkt korrigieren.</div></div><span className="badge">{entries.length}</span></div><div className="entryList">{entries.length===0?<div className="empty">Noch keine Einträge.</div>:entries.slice(0,30).map(e=><div className="entry" key={e.id}><div className="entryMain"><div className="entryTitle">{e.customers?.name}</div><div className="entryMeta">{niceDate(e.work_date)} · {String(e.hours).replace('.',',')} Std.{e.notes?` · ${e.notes}`:''}</div></div><div className="entryActions"><button className="btn secondary" onClick={()=>startEdit(e)}>Bearbeiten</button><button className="btn danger" onClick={()=>remove(e.id)}>Löschen</button></div></div>)}</div></section>
  {editing&&<div className="modalBackdrop" onClick={()=>setEditing(null)}><div className="card modal stack" onClick={e=>e.stopPropagation()}><h2>Eintrag bearbeiten</h2><div className="field"><label>Datum</label><input type="date" value={editing.work_date} onChange={e=>setEditing({...editing,work_date:e.target.value})}/></div><div className="field"><label>Stunden</label><input inputMode="decimal" value={String(editing.hours).replace('.',',')} onChange={e=>setEditing({...editing,hours:Number(e.target.value.replace(',','.'))})}/></div><div className="field"><label>Notiz</label><textarea value={editing.notes||''} onChange={e=>setEditing({...editing,notes:e.target.value})}/></div><div className="actions"><button className="btn secondary" onClick={()=>setEditing(null)}>Abbrechen</button><button className="btn primary" onClick={updateEntry}>Änderung speichern</button></div></div></div>}
 </main>
}
