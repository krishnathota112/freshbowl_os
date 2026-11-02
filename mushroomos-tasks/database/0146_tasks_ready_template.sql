-- Ready compost template and atomic creation of a batch's edited task plan.
-- Existing SOPs, batches and task records are not changed.
insert into public.tk_sop (id, family_id, name, status, note, reference_h0, published_at)
values ('14600000-0000-4000-8000-000000000001', '14600000-0000-4000-8000-000000000001',
  'Compost standard', 'published',
  'Ready template from the owner’s schedule. Calendar dates take priority over conflicting hour references. Approximate timings and the tunnel duration need review. Edit the table for each batch.',
  '2026-08-31 09:00+05:30', now());

insert into public.tk_sop_row (sop_id, ord, line, title, kind, control, lab_checkpoint, photos, ask, suggested_offset_minutes)
select '14600000-0000-4000-8000-000000000001', n, stream, title, kind, control, checkpoint,
       case when kind in ('lab_gate','rest') then 'none' else 'both' end, 'none',
       (extract(epoch from ((at_time || '+05:30')::timestamptz - '2026-08-31 09:00+05:30'::timestamptz))/60)::int
from (values
 (1, '2026-08-29 23:00', 'Main', 'Raw material / bagasse weighment', 'work', 'Approximate time. Moisture, pH, EC, dry weight; advisory.', null),
 (2, '2026-08-31 09:00', 'Main', 'Bagasse wetting + Hopper Pass 1', 'work', 'Moisture, pH, EC after Hopper Pass 1.', null),
 (3, '2026-08-31 12:00', 'Main', 'Material rest begins', 'rest', '', null),
 (4, '2026-08-31 20:00', 'Main', 'Hopper Pass 2; dry or water branch', 'work', 'Moisture, pH, EC after Hopper Pass 2.', null),
 (5, '2026-08-31 23:00', 'Main', 'Heap formation + rest', 'rest', '', null),
 (6, '2026-09-01 11:00', 'Main', 'Lab approval before first bunker load', 'lab_gate', 'Moisture, pH, EC + evidence + GM approval.', 'LAB-04'),
 (7, '2026-09-01 11:00', 'Main', 'First bunker load', 'work', '2-hour bunker fill, after Lab approval.', null),
 (8, '2026-09-01 13:00', 'Main', 'Conditioning begins', 'work', '45–55°C; first trigger ≥58°C or ≥60 hours.', null),
 (9, '2026-09-03 11:00', 'Paddy', 'Paddy preparation starts', 'work', 'Moisture + dry weight.', null),
 (10, '2026-09-03 23:00', 'Paddy', 'Paddy soak 1', 'work', 'pH, EC, TDS.', null),
 (11, '2026-09-04 01:00', 'Main', 'Bunker unload / reload', 'work', 'Moisture, pH, EC.', null),
 (12, '2026-09-04 21:00', 'Paddy', 'Paddy soak 2', 'work', 'pH, EC, TDS.', null),
 (13, '2026-09-05 19:00', 'CM mix', 'Chicken manure + minerals weighment', 'work', 'Nitrogen, ash.', null),
 (14, '2026-09-05 21:00', 'CM mix', 'Rotavator dry mix', 'work', 'No water.', null),
 (15, '2026-09-05 22:00', 'CM mix', 'Moisture decision', 'work', '≥68% proceed; <67% correct/retest; 67–68% unresolved — confirm before proceeding.', null),
 (16, '2026-09-06 01:00', 'CM mix', 'Lab approval before first convergence', 'lab_gate', 'Nitrogen + ash; GM approval.', 'LAB-13'),
 (17, '2026-09-06 01:00', 'CM mix', 'First convergence; CM mix begins', 'work', 'After Lab approval.', null),
 (18, '2026-09-06 09:00', 'CM mix', 'Water hopper pass + another hopper pass', 'work', 'Target ~73% moisture; <45–50°C. Source describes two 3-hour passes; check timing against the next rest at 13:00.', null),
 (19, '2026-09-06 13:00', 'CM mix', 'Rest', 'rest', '10-hour rest in source. Review timing before use.', null),
 (20, '2026-09-07 01:00', 'Main', 'Second convergence', 'work', 'Paddy ready; two equal piles.', null),
 (21, '2026-09-07 05:00', 'Main', 'Add conditioned bagasse + CM mix', 'work', '', null),
 (22, '2026-09-07 07:00', 'Main', 'Flip 1 + Flip 2', 'work', 'Back-to-back.', null),
 (23, '2026-09-07 15:00', 'Main', 'Turner start', 'work', 'Six working piles; M1 + M2.', null),
 (24, '2026-09-07 15:00', 'Turner T0', 'T0', 'work', 'Window 15:00–21:00 in example. NO LAB AFTER T0.', null),
 (25, '2026-09-07 18:00', 'Turner T1', 'T1 interleaved with T0', 'work', 'Approximate start. LAB BEFORE / AFTER T1 only.', null),
 (26, '2026-09-08 00:00', 'Turner T1', 'T1 window complete', 'work', 'Post-T1 moisture per pile.', null),
 (27, null, 'Turner T2', 'T2 after each pile’s 8-hour rest', 'work', '8 Sep onward in source; set time per pile after its rest. NO LAB AFTER T2.', null),
 (28, null, 'Turner T3', 'T3', 'work', '8 Sep onward in source; set time per pile. NO LAB AFTER T3.', null),
 (29, '2026-09-08 11:00', 'Main', 'Bunker 1 fill', 'work', 'P1 + P2.', null),
 (30, '2026-09-08 13:00', 'Main', 'Bunker 2 fill', 'work', 'P3 + P4.', null),
 (31, '2026-09-08 15:00', 'Main', 'Bunker 3 fill', 'work', 'P5 + P6.', null),
 (32, '2026-09-11 04:00', 'Main', 'Bunker 1 reload', 'work', 'Height / moisture / full set.', null),
 (33, '2026-09-11 06:00', 'Main', 'Bunker 2 reload', 'work', 'Height / moisture / full set.', null),
 (34, '2026-09-11 08:00', 'Main', 'Bunker 3 reload', 'work', 'Height / moisture / full set.', null),
 (35, '2026-09-13 21:00', 'Main', 'Lab approval before tunnel loading', 'lab_gate', 'Tunnel height + full lab gate; choose the applicable checkpoint.', null),
 (36, '2026-09-13 21:00', 'Main', 'Tunnel loading stream 1', 'work', 'After Lab approval.', null),
 (37, '2026-09-13 23:00', 'Main', 'Tunnel loading stream 2', 'work', '', null),
 (38, '2026-09-14 03:00', 'Main', 'Tunnel loading stream 3', 'work', '', null),
 (39, '2026-09-14 05:00', 'Main', 'Tunnel filling complete', 'work', 'Tunnel process begins.', null),
 (40, '2026-09-14 05:00', 'Main', 'Tunnel process', 'work', '144-hour working standard in source; example discharge is only 138 hours after filling. Confirm discharge dates.', null),
 (41, '2026-09-19 23:00', 'Main', 'First grow-room stream', 'work', 'Final QC.', null),
 (42, '2026-09-20 01:00', 'Main', 'Second stream discharge', 'work', 'Final QC as configured.', null),
 (43, '2026-09-20 03:00', 'Main', 'Final stream discharge', 'work', 'Full batch discharge.', null)
) as source(n, at_time, stream, title, kind, control, checkpoint);

create or replace function public.tk_batch_create_plan(p_name text, p_sop uuid, p_h0 timestamptz, p_note text, p_rows jsonb)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare b uuid; cleaned jsonb;
begin
  perform public.assert_role(array['admin']::app_role[], 'create a batch');
  if p_h0 is null then raise exception 'Choose the batch start date and time.'; end if;
  cleaned := public.tk_clean_rows(p_rows);
  if jsonb_array_length(cleaned) = 0 then raise exception 'Add at least one task.'; end if;
  -- Create and customize in one transaction; no partially configured batch is exposed.
  b := public.tk_batch_create_v2(p_name, p_sop, p_h0, p_note);
  delete from public.tk_task where batch_id = b;
  insert into public.tk_task (batch_id, ord, line, h_ref, title, kind, control, lab_checkpoint, photos, ask, suggested_at)
  select b, (c->>'ord')::int, c->>'line', c->>'h_ref', c->>'title', c->>'kind', c->>'control', c->>'lab_checkpoint', c->>'photos', c->>'ask',
         p_h0 + nullif(r->>'suggested_offset_minutes','')::int * interval '1 minute'
  from jsonb_array_elements(cleaned) c
  join (
    select x.value r, row_number() over(order by x.ordinality)::int n
    from jsonb_array_elements(p_rows) with ordinality x(value, ordinality)
    where coalesce(trim(x.value->>'title'),'') <> ''
  ) input on input.n = (c->>'ord')::int;
  perform public.tk_log('tk_batch_plan', 'tk_batch', b, jsonb_build_object('source_sop', p_sop, 'rows', p_rows));
  return b;
end $fn$;
revoke all on function public.tk_batch_create_plan(text, uuid, timestamptz, text, jsonb) from public, anon;
grant execute on function public.tk_batch_create_plan(text, uuid, timestamptz, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
