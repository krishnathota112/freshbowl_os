#!/usr/bin/env node
/**
  * Role, gate and isolation enforcement, over HTTP as REAL signed-in users on the REAL batches.
 *
 * Every refusal here must come from the SERVER. A frontend that hides a button proves nothing:
 * these calls go straight to PostgREST with each person's own token, exactly as someone holding
 * the anon key and a valid login would.
 *
 * DELIBERATELY READ-ONLY OR REFUSED. Every call below either reads, or is expected to be refused
 * and therefore writes nothing. One earlier check called submit_activity on a not-started activity;
 * it is gone, because that call STAMPS actual_start as a side effect and fn_actual_is_append_only
 * then makes the stamp permanent. A test must not leave marks that cannot be removed. The finding
 * that check produced is recorded in the session report instead.
 */
import { readFileSync } from 'node:fs';
if (!process.env.NODE_EXTRA_CA_CERTS) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = (k) => { for (const l of raw.split('\n')) { const t=l.trim(), e=t.indexOf('=');
  if (e>0 && t.slice(0,e).trim()===k) return t.slice(e+1).trim().replace(/^["']|["']$/g,''); } };
const U = env('VITE_SUPABASE_URL'), A = env('VITE_SUPABASE_ANON_KEY');
const si = async (m) => (await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method:'POST', headers:{apikey:A,'Content-Type':'application/json'},
  body:JSON.stringify({email:m,password:'mushroom2026'})})).json()).access_token;
const H = (t) => ({ apikey:A, Authorization:`Bearer ${t}`, 'Content-Type':'application/json' });
const rpc = async (t,f,a) => { const r = await fetch(`${U}/rest/v1/rpc/${f}`,{method:'POST',headers:H(t),body:JSON.stringify(a)});
  const x = await r.text(); let b=x; try{b=JSON.parse(x);}catch{} return {ok:r.ok,status:r.status,body:b}; };
const rest = async (t,p) => { const r = await fetch(`${U}/rest/v1/${p}`,{headers:H(t)});
  const j = await r.json(); return { status:r.status, rows: Array.isArray(j)?j:[], raw:j }; };

let pass=0; const fails=[];
const ok=(l,c,d='')=>{ if(c){pass++;console.log(`   \x1b[32m✓\x1b[0m ${l}`);} else {fails.push(l);console.log(`   \x1b[31m✗ ${l}\x1b[0m${d?'\n       '+d:''}`);} };
const step=(s)=>console.log(`\n\x1b[1m── ${s}\x1b[0m`);
const msg=(b)=>String(typeof b==='string'?b:(b?.message||b?.hint||JSON.stringify(b))).slice(0,160);

const opr = await si('operator@freshbowl.demo');
const lab = await si('lab@freshbowl.demo');
const sup = await si('supervisor@freshbowl.demo');
const gm  = await si('gm@freshbowl.demo');

step('anon holds nothing (0061)');
for (const v of ['v_my_work','master_batch','v_lab_approval_queue','evidence_media']) {
  const r = await fetch(`${U}/rest/v1/${v}?select=*&limit=1`, { headers:{apikey:A} });
  ok(`unauthenticated read of ${v} is refused`, r.status===401||r.status===403, `HTTP ${r.status}`);
}

step('each role sees only its own work');
const om = await rest(opr,'v_my_work?select=batch_code,code,responsible_role&limit=500');
const lm = await rest(lab,'v_my_work?select=batch_code,code,responsible_role&limit=500');
const oroles=[...new Set(om.rows.map(r=>r.responsible_role))], lroles=[...new Set(lm.rows.map(r=>r.responsible_role))];
ok('the operator queue holds only operator rows', oroles.length&&oroles.every(r=>r==='operator'), oroles.join(', '));
ok('the lab queue holds only lab rows', lroles.length&&lroles.every(r=>r==='lab_tech'), lroles.join(', '));
ok(`the operator's work spans several batches, each naming its own`,
   new Set(om.rows.map(r=>r.batch_code)).size >= 3, [...new Set(om.rows.map(r=>r.batch_code))].join(', '));

step('an operator may not do laboratory work (0066)');
const labRow = lm.rows.length ? (await rest(lab,'v_my_work?select=activity_id,code&responsible_role=eq.lab_tech&limit=1')).rows[0] : null;
if (!labRow) ok('a lab row exists to test against', false);
else {
  const r = await rpc(opr,'start_activity',{p_activity:labRow.activity_id});
  ok(`the server refuses the operator starting ${labRow.code}`, !r.ok, `HTTP ${r.status} ${msg(r.body)}`);
  ok('and the refusal names who may do it instead', /lab/i.test(msg(r.body)), msg(r.body));
}

step('evidence cannot be filed under another batch (0066)');
const w = (await rest(sup,'v_my_work?select=activity_id,master_batch_id,batch_code&limit=300')).rows;
const a1 = w[0], a2 = w.find(x=>x.master_batch_id !== a1?.master_batch_id);
if (!a1||!a2) ok('two batches available to cross', false);
else {
  const up = await fetch(`${U}/storage/v1/object/evidence/${a2.master_batch_id}/${a1.activity_id}/cross-${Date.now()}.jpg`,
    { method:'POST', headers:{apikey:A,Authorization:`Bearer ${opr}`,'Content-Type':'image/jpeg'}, body:Buffer.from([0xff,0xd8,0xff,0xd9]) });
  ok(`storage refuses ${a1.batch_code}'s activity under ${a2.batch_code}'s folder`, !up.ok, `HTTP ${up.status}`);
}

step('the approval queue is management-only, and a lab tech may never decide (C-32)');
const qs = await rest(sup,'v_lab_approval_queue?select=*&limit=5');
const qo = await rest(opr,'v_lab_approval_queue?select=*&limit=5');
ok('a supervisor can read the approval queue', qs.status===200, `HTTP ${qs.status}`);
ok('an operator reads no approvals from it', qo.status!==200 || qo.rows.length===0, `HTTP ${qo.status}, ${qo.rows.length} row(s)`);
if (qs.rows.length) {
  const sub = qs.rows[0];
  const key = Object.keys(sub).find(k=>/submission|approval/.test(k) && /id$/.test(k)) ?? 'submission_id';
  const r = await rpc(lab,'decide_lab_submission',{ p_submission: sub[key], p_approved: true, p_reason: 'role probe — must be refused' });
  ok('the server refuses a lab technician approving a submission', !r.ok, `HTTP ${r.status} ${msg(r.body)}`);
} else {
  console.log('   \x1b[33m•\x1b[0m no submission is currently awaiting approval — nothing to decide against');
}

step('a GM sees the management view an operator cannot');
const ge = await rest(gm,'v_batch_event?select=*&limit=1');
const oe = await rest(opr,'v_batch_event?select=*&limit=1');
ok('a GM can read v_batch_event', ge.status===200, `HTTP ${ge.status}`);
ok('an operator cannot', oe.status!==200 || oe.rows.length===0, `HTTP ${oe.status}, ${oe.rows.length} row(s)`);

console.log(`\n\x1b[1m${pass} passed, ${fails.length} failed\x1b[0m`);
if (fails.length) { fails.forEach(f=>console.log('   ✗ ' + f)); process.exit(1); }
