#!/usr/bin/env node
/**
 * WAVE 2 - C · EVIDENCE INTEGRITY IN DEPTH
 *   8  retake / supersession semantics    9  evidence kind substitution
 *  10  MIME and content mismatch         11  size boundaries
 *  12  orphan and dangling recovery      13  deletion and archiving
 *
 * Evidence is the proof. Everything here asks whether the proof can be made to say something the
 * factory did not do - by replacing it, mislabelling it, emptying it, or removing it afterwards.
 */
import { cast, buildBatch, rpc, rest, readOrDie, upload, patch, id, msg, U, A as ANON,
         section, note, warn, mustRefuse, mustHold, report } from './lib.mjs';

const P = await cast();
const JPEG = Buffer.from([0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0,0,0,1,0,1,0,0,0xff,0xd9]);
const PNG  = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52]);
const PDF  = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const EXE  = Buffer.from([0x4d,0x5a,0x90,0x00,0x03,0,0,0,0x04,0]);
const TEXT = Buffer.from('this is not a photograph, it is a sentence');

section('SETUP');
const A = await buildBatch({ adm: P.admin, sup: P.supervisor, lab: P.lab, tag: 'EV' });
note(A.code);
const used = new Set();
async function pick() {
  const rows = await readOrDie(P.operator,
    `v_my_work?select=activity_id,code,state&master_batch_id=eq.${A.B}&responsible_role=eq.operator&state=eq.READY&limit=40`, 'work');
  for (const r of rows) {
    if (used.has(r.activity_id)) continue;
    const q = await readOrDie(P.operator, `batch_activity_evidence_req?select=id,key,label,media_kinds,min_count&batch_activity_id=eq.${r.activity_id}`, 'reqs');
    if (q.length >= 2) { used.add(r.activity_id); return { ...r, reqs: q }; }
  }
  const f = rows.find(r => !used.has(r.activity_id)); used.add(f?.activity_id); return { ...f, reqs: [] };
}
const put = async (t, act, name, bytes, mime = 'image/jpeg') => {
  const p = `${A.B}/${act}/${name}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const r = await upload(t, p, bytes, mime);
  return { path: p, ok: r.ok, status: r.status };
};
const media = async (act) => readOrDie(P.supervisor,
  `evidence_media?select=id,requirement_key,storage_path,byte_size,mime_type,superseded_by_id,superseded_reason,uploaded_at&batch_activity_id=eq.${act}&order=uploaded_at`, 'media');
const reqState = async (act) => readOrDie(P.operator,
  `batch_activity_evidence_req?select=key,satisfied_count,min_count&batch_activity_id=eq.${act}&order=key`, 'rs');

/* ══ 8 · RETAKE / SUPERSESSION ══════════════════════════════════════════════ */
section('8 - RETAKE SEMANTICS (three photos for one requirement)');

const t8 = await pick();
await rpc(P.operator, 'start_activity', { p_activity: t8.activity_id });
const k8 = t8.reqs[0].key;

const u1 = await put(P.operator, t8.activity_id, 'shot1.jpg', JPEG);
const b1 = await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: k8, p_storage_path: u1.path, p_media_kind: 'photo' });
const firstId = Array.isArray(b1.body) ? b1.body[0]?.media_id : null;

const u2 = await put(P.operator, t8.activity_id, 'shot2.jpg', JPEG);
const b2blind = await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: k8, p_storage_path: u2.path, p_media_kind: 'photo' });
mustRefuse({ id: 'W-EV-01', sev: 'P1', attack: 'a second photo for a satisfied requirement, without saying what it replaces',
  expected: 'refused - a retake must name the item it supersedes and why', res: b2blind });

const b2 = await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: k8,
  p_storage_path: u2.path, p_media_kind: 'photo', p_supersedes: firstId, p_supersede_reason: 'first frame was blurred' });
const secondId = Array.isArray(b2.body) ? b2.body[0]?.media_id : null;

const u3 = await put(P.operator, t8.activity_id, 'shot3.jpg', JPEG);
const b3 = await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: k8,
  p_storage_path: u3.path, p_media_kind: 'photo', p_supersedes: secondId, p_supersede_reason: 'operator moved, retook it' });

const m8 = await media(t8.activity_id);
const live = m8.filter(m => m.requirement_key === k8 && !m.superseded_by_id);
const dead = m8.filter(m => m.requirement_key === k8 && m.superseded_by_id);
note(`${k8}: ${m8.filter(m=>m.requirement_key===k8).length} rows, ${live.length} live, ${dead.length} superseded`);
mustHold({ id: 'W-EV-02', sev: 'P1', attack: 'after two retakes exactly one photo is current',
  expected: '1 live, 2 superseded, all three rows kept',
  actual: `${live.length} live, ${dead.length} superseded`,
  ok: b2.ok && b3.ok && live.length === 1 && dead.length === 2 });

mustHold({ id: 'W-EV-03', sev: 'P1', attack: 'the current photo is the LAST one taken',
  expected: 'the live row is shot3', actual: String(live[0]?.storage_path).split('/').pop(),
  ok: String(live[0]?.storage_path).includes('shot3') });

mustHold({ id: 'W-EV-04', sev: 'P0', attack: 'every superseded photo keeps its reason',
  expected: 'each superseded row carries why it was replaced',
  actual: dead.map(d => d.superseded_reason).join(' | '),
  ok: dead.length > 0 && dead.every(d => !!d.superseded_reason) });

const rs8 = await reqState(t8.activity_id);
const r8 = rs8.find(r => r.key === k8);
mustHold({ id: 'W-EV-05', sev: 'P1', attack: 'three photos do not count as three satisfactions',
  expected: `satisfied_count 1 of ${r8?.min_count}`, actual: `${r8?.satisfied_count} of ${r8?.min_count}`,
  ok: Number(r8?.satisfied_count) === 1 });

mustRefuse({ id: 'W-EV-06', sev: 'P1', attack: 'supersede a photo that was already superseded',
  expected: 'refused - it is not the live item',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: k8,
    p_storage_path: (await put(P.operator, t8.activity_id, 'shot4.jpg', JPEG)).path,
    p_media_kind: 'photo', p_supersedes: firstId, p_supersede_reason: 'reaching past the current one' }) });

mustRefuse({ id: 'W-EV-07', sev: 'P1', attack: 'a retake with no stated reason',
  expected: 'refused - the original is kept, so the replacement must say why',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: k8,
    p_storage_path: (await put(P.operator, t8.activity_id, 'shot5.jpg', JPEG)).path,
    p_media_kind: 'photo', p_supersedes: live[0]?.id, p_supersede_reason: '   ' }) });

// A retake must not land on a different requirement than the one it replaces.
const otherKey = t8.reqs.find(r => r.key !== k8)?.key;
mustRefuse({ id: 'W-EV-08', sev: 'P1', attack: `supersede a ${k8} photo while binding to ${otherKey}`,
  expected: 'refused - the replacement belongs to the same requirement',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: t8.activity_id, p_requirement_key: otherKey,
    p_storage_path: (await put(P.operator, t8.activity_id, 'shot6.jpg', JPEG)).path,
    p_media_kind: 'photo', p_supersedes: live[0]?.id, p_supersede_reason: 'cross-requirement retake' }) });

/* ══ 9 · EVIDENCE KIND SUBSTITUTION ═════════════════════════════════════════ */
section('9 - EVIDENCE KIND SUBSTITUTION');

const t9 = await pick();
await rpc(P.operator, 'start_activity', { p_activity: t9.activity_id });
const r9 = t9.reqs[0];
note(`${r9.key} accepts: ${JSON.stringify(r9.media_kinds)}`);
const wrongKind = ['document', 'video', 'audio', 'signature'].find(k => !(r9.media_kinds ?? []).includes(k)) ?? 'document';
const u9 = await put(P.operator, t9.activity_id, 'thing.jpg', JPEG);
mustRefuse({ id: 'W-EV-09', sev: 'P1', attack: `offer a '${wrongKind}' where ${r9.key} accepts ${JSON.stringify(r9.media_kinds)}`,
  expected: 'refused - the kind must be one this requirement accepts',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: t9.activity_id, p_requirement_key: r9.key,
    p_storage_path: u9.path, p_media_kind: wrongKind }) });

mustRefuse({ id: 'W-EV-10', sev: 'P2', attack: 'a made-up media kind',
  expected: 'refused',
  res: await rpc(P.operator, 'bind_evidence', { p_activity: t9.activity_id, p_requirement_key: r9.key,
    p_storage_path: u9.path, p_media_kind: 'interpretive_dance' }) });

/* ══ 10 · MIME AND CONTENT MISMATCH ═════════════════════════════════════════ */
section('10 - MIME AND CONTENT MISMATCH (declared type vs what is actually there)');

const t10 = await pick();
await rpc(P.operator, 'start_activity', { p_activity: t10.activity_id });
const k10 = t10.reqs[0].key;
const cases = [
  ['PNG bytes declared image/jpeg', PNG,  'image/jpeg'],
  ['text declared image/jpeg',      TEXT, 'image/jpeg'],
  ['an executable declared image/jpeg', EXE, 'image/jpeg'],
  ['a PDF declared application/pdf', PDF,  'application/pdf'],
  ['HTML declared text/html',        Buffer.from('<script>x</script>'), 'text/html'],
];
for (const [label, bytes, mime] of cases) {
  const u = await put(P.operator, t10.activity_id, 'x.jpg', bytes, mime);
  if (!u.ok) { note(`${label.padEnd(36)} upload refused (HTTP ${u.status})`); continue; }
  const b = await rpc(P.operator, 'bind_evidence', { p_activity: t10.activity_id, p_requirement_key: k10,
    p_storage_path: u.path, p_media_kind: 'photo' });
  note(`${label.padEnd(36)} upload ${u.status}, bind ${b.status} ${b.ok ? 'BOUND' : 'refused'}`);
  if (b.ok) {
    const m = (await media(t10.activity_id)).find(x => x.storage_path === u.path);
    warn(`bound as ${m?.mime_type}, ${m?.byte_size} bytes - content is not inspected`);
    // one is enough to make the point; supersede it back out so later checks are clean
    break;
  }
}
const boundNonImage = (await media(t10.activity_id)).some(m => m.mime_type && !/^image\//.test(m.mime_type));
mustHold({ id: 'W-EV-11', sev: 'P2', attack: 'a non-image declared as a photograph',
  expected: 'the storage bucket restricts the declared MIME type to images',
  actual: boundNonImage ? 'a non-image MIME type was accepted and bound' : 'only image MIME types reached the bucket',
  ok: !boundNonImage });

/* ══ 11 · SIZE BOUNDARIES ═══════════════════════════════════════════════════ */
section('11 - SIZE BOUNDARIES');

const t11 = await pick();
await rpc(P.operator, 'start_activity', { p_activity: t11.activity_id });
const k11 = t11.reqs[0].key;
for (const [label, bytes] of [['0 bytes', Buffer.alloc(0)], ['1 byte', Buffer.from([0xff])],
                              ['64 KB', Buffer.alloc(65536, 0xff)], ['8 MB', Buffer.alloc(8 * 1024 * 1024, 0xff)]]) {
  const u = await put(P.operator, t11.activity_id, 'size.jpg', bytes);
  let bindStatus = 'not attempted';
  if (u.ok) {
    const b = await rpc(P.operator, 'bind_evidence', { p_activity: t11.activity_id, p_requirement_key: k11,
      p_storage_path: u.path, p_media_kind: 'photo' });
    bindStatus = b.ok ? 'BOUND' : `refused (${msg(b.body).slice(0, 60)})`;
    if (b.ok) {
      // free the slot again so the next size can be measured on equal terms
      const liveNow = (await media(t11.activity_id)).filter(m => m.requirement_key === k11 && !m.superseded_by_id)[0];
      if (liveNow) await rpc(P.operator, 'bind_evidence', { p_activity: t11.activity_id, p_requirement_key: k11,
        p_storage_path: (await put(P.operator, t11.activity_id, 'reset.jpg', JPEG)).path, p_media_kind: 'photo',
        p_supersedes: liveNow.id, p_supersede_reason: 'size probe reset' });
    }
  }
  note(`${label.padEnd(9)} upload HTTP ${u.status}  bind ${bindStatus}`);
}
const zeroBound = (await media(t11.activity_id)).some(m => Number(m.byte_size) === 0);
mustHold({ id: 'W-EV-12', sev: 'P1', attack: 'an empty file still cannot satisfy a requirement (0071 holding)',
  expected: 'no zero-byte row is bound', actual: zeroBound ? 'a 0-byte row is bound' : 'none', ok: !zeroBound });

/* ══ 12 · ORPHAN AND DANGLING ═══════════════════════════════════════════════ */
section('12 - ORPHAN AND DANGLING EVIDENCE');

const t12 = await pick();
await rpc(P.operator, 'start_activity', { p_activity: t12.activity_id });
const k12 = t12.reqs[0].key;

const orphan = await put(P.operator, t12.activity_id, 'orphan.jpg', JPEG);
const rs12a = await reqState(t12.activity_id);
mustHold({ id: 'W-EV-13', sev: 'P1', attack: 'an uploaded but unbound file counts for nothing',
  expected: 'satisfied_count 0', actual: JSON.stringify(rs12a.map(r => `${r.key}:${r.satisfied_count}`)),
  ok: rs12a.every(r => Number(r.satisfied_count) === 0) });

const bound = await put(P.operator, t12.activity_id, 'bound.jpg', JPEG);
await rpc(P.operator, 'bind_evidence', { p_activity: t12.activity_id, p_requirement_key: k12, p_storage_path: bound.path, p_media_kind: 'photo' });
const del = await fetch(`${U}/storage/v1/object/evidence/${bound.path}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${P.operator}` } });
const stillThere = await fetch(`${U}/storage/v1/object/evidence/${bound.path}`, { headers: { apikey: ANON, Authorization: `Bearer ${P.operator}` } });
mustHold({ id: 'W-EV-14', sev: 'P0', attack: 'the file behind a satisfied requirement cannot be deleted out from under it',
  expected: 'the delete is refused and the object is still there',
  actual: `delete HTTP ${del.status}, fetch HTTP ${stillThere.status}`,
  ok: !del.ok && stillThere.ok });

/* ══ 13 · DELETION AND ARCHIVING ════════════════════════════════════════════ */
section('13 - WHO MAY REMOVE EVIDENCE');

const liveRow = (await media(t12.activity_id)).find(m => !m.superseded_by_id);
for (const [who, tok, sev] of [['operator', P.operator, 'P1'], ['supervisor', P.supervisor, 'P1'],
                               ['admin', P.admin, 'P0'], ['gm', P.gm, 'P0']]) {
  const d = await fetch(`${U}/storage/v1/object/evidence/${liveRow.storage_path}`,
    { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${tok}` } });
  mustRefuse({ id: `W-EV-15-${who}`, sev, attack: `${who} deletes a filed evidence file from storage`,
    expected: 'refused - filed evidence is a record, superseded rather than removed',
    res: { ok: d.ok, status: d.status } });
}
for (const [who, tok] of [['operator', P.operator], ['admin', P.admin]]) {
  mustRefuse({ id: `W-EV-16-${who}`, sev: 'P0', attack: `${who} deletes the evidence_media row over PostgREST`,
    expected: 'refused',
    res: await (async () => {
      const r = await fetch(`${U}/rest/v1/evidence_media?id=eq.${liveRow.id}`,
        { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${tok}` } });
      return { ok: r.ok, status: r.status };
    })() });
}
mustRefuse({ id: 'W-EV-17', sev: 'P0', attack: 'admin rewrites an evidence row to point at a different file',
  expected: 'refused',
  res: await patch(P.admin, `evidence_media?id=eq.${liveRow.id}`, { storage_path: 'somewhere/else/file.jpg' }) });

report('WAVE 2C - EVIDENCE INTEGRITY');
console.log(`batch: ${A.code}`);
