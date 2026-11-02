-- 0158 · WEIGHMENT IN THE MAIN APP (owner, 30 Sep 2026): "weighment is decided by the admin for a new batch or existing
-- batch. Any supervisor will have the access for the weighbridge; the logic that I decided will be the same."
--   1. Supervisors (and operators — current_app_role() already treats them as supervisors) may record slips and
--      mark a material Finished, and read what is to be weighed. Exactly the 0151/0153/0157 rules; nothing else.
--      They do NOT see alerts, and cannot set weights, void, reopen or close (Admin only, unchanged).
--   2. wb_batch.master_batch_id links weighment batch numbers to a main-app batch (master_batch):
--      · existing batch: Admin picks it → wb_batch_create_for_master(); the numbers are the batch code;
--      · new batch: Admin types the numbers as before; wb_v_batch shows the main batch automatically once one with the
--        same code exists (spaces ignored, cancelled batches ignored). No trigger on main-app tables.
-- Function bodies below are the LIVE definitions of 30 Sep 2026 with only the role lists changed.
-- Needs 0150–0157. Rollback: rollback_0158_weighment_main_app.sql.

-- ── 1. supervisors weigh ────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wb_add_slip(p_req uuid, p_ticket text, p_vehicle text, p_supplier text, p_gross_kg numeric, p_tare_kg numeric, p_net_kg numeric, p_photo_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r wb_requirement; net numeric; v uuid; got numeric; v_is_over boolean;
begin
  perform public.assert_role(array['weighbridge', 'admin', 'supervisor']::app_role[], 'record a weighment slip');
  r := public.wb_req_for_update(p_req);
  if r.finished_at is not null then raise exception 'This material is marked finished. Ask Admin to reopen it.'; end if;
  if coalesce(trim(p_ticket), '') = '' then raise exception 'Enter the ticket number from the slip.'; end if;
  if exists (select 1 from wb_slip where lower(trim(ticket_no)) = lower(trim(p_ticket)) and voided_at is null) then
    raise exception 'Ticket % is already recorded.', trim(p_ticket);
  end if;
  if p_gross_kg is not null and p_tare_kg is not null then
    if p_tare_kg >= p_gross_kg then raise exception 'Tare must be less than gross.'; end if;
    net := p_gross_kg - p_tare_kg;
    if p_net_kg is not null and abs(p_net_kg - net) > 1 then
      raise exception 'Net % kg does not match gross − tare = % kg. Check the slip.', round(p_net_kg), round(net);
    end if;
  else
    net := p_net_kg;
  end if;
  if coalesce(net, 0) <= 0 then raise exception 'Enter the net weight (or gross and tare).'; end if;
  if split_part(p_photo_path, '/', 1) <> p_req::text then raise exception 'The photo is not filed under this requirement.'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'weighments' and o.name = p_photo_path and coalesce((o.metadata->>'size')::bigint, 0) > 0) then
    raise exception 'The slip photo did not arrive. Take it again.';
  end if;
  insert into wb_slip (requirement_id, ticket_no, vehicle_no, supplier, gross_kg, tare_kg, net_kg, photo_path, recorded_by)
  values (p_req, trim(p_ticket), nullif(trim(coalesce(p_vehicle, '')), ''), nullif(trim(coalesce(p_supplier, '')), ''),
          round(p_gross_kg, 3), round(p_tare_kg, 3), round(net, 3), p_photo_path, auth.uid())
  returning id into v;
  v_is_over := public.wb_check_over(p_req, v);
  got := public.wb_received_kg(p_req);
  perform public.wb_log('wb_add_slip', 'wb_slip', v, jsonb_build_object('ticket', trim(p_ticket), 'net_kg', net, 'received_kg', got));
  return jsonb_build_object('slip_id', v, 'net_kg', round(net, 3), 'received_kg', got, 'required_kg', r.required_kg,
                            'remaining_kg', r.required_kg - got, 'over', v_is_over);
end $function$;

CREATE OR REPLACE FUNCTION public.wb_finish(p_req uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r wb_requirement; got numeric; v_short numeric;
begin
  perform public.assert_role(array['weighbridge', 'admin', 'supervisor']::app_role[], 'finish a material');
  r := public.wb_req_for_update(p_req);
  if r.finished_at is not null then raise exception 'Already finished.'; end if;
  got := public.wb_received_kg(p_req);
  update wb_requirement set finished_at = now(), finished_by = auth.uid(), finish_note = nullif(trim(coalesce(p_note, '')), '') where id = p_req;
  v_short := r.required_kg - got;
  if v_short > r.tolerance_kg then
    insert into wb_alert (requirement_id, kind, amount_kg, message)
    values (p_req, 'short', v_short, public.wb_label(p_req) || ': finished at ' || public.wb_fmt(got) || ' against '
            || public.wb_fmt(r.required_kg) || ' — ' || public.wb_fmt(v_short) || ' SHORT.');
  end if;
  perform public.wb_log('wb_finish', 'wb_requirement', p_req, jsonb_build_object('received_kg', got, 'required_kg', r.required_kg));
  return jsonb_build_object('received_kg', got, 'required_kg', r.required_kg, 'short', v_short > r.tolerance_kg);
end $function$;

do $$
declare t text;
begin
  foreach t in array array['wb_material', 'wb_requirement', 'wb_slip', 'wb_batch'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using '
                   '(public.has_role(variadic array[''admin'',''gm'',''manager'',''weighbridge'',''supervisor'']::app_role[]))', t);
  end loop;
end $$;

drop policy if exists weighments_insert on storage.objects;
create policy weighments_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'weighments'
  and array_length(path_tokens, 1) = 2
  and public.has_role(variadic array['weighbridge', 'admin', 'supervisor']::app_role[])
  and (exists (select 1 from public.wb_requirement r where r.id::text = path_tokens[1])
       or (public.has_role(variadic array['admin']::app_role[]) and exists (select 1 from public.wb_batch b where b.id::text = path_tokens[1])))
);
drop policy if exists weighments_read on storage.objects;
create policy weighments_read on storage.objects for select to authenticated using (
  bucket_id = 'weighments' and public.has_role(variadic array['weighbridge', 'admin', 'gm', 'manager', 'supervisor']::app_role[])
);

-- ── 2. link to the main-app batch ───────────────────────────────────────────────────────────────────────────────
alter table public.wb_batch add column if not exists master_batch_id uuid references public.master_batch(id);
create unique index if not exists wb_batch_master_open on public.wb_batch (master_batch_id) where status = 'active' and master_batch_id is not null;

-- the main-app batch whose code matches typed numbers (spaces ignored; newest non-cancelled one)
create or replace function public.wb_match_master(p_batch_no text) returns uuid
language sql stable security definer set search_path = public as $fn$
  select m.id from master_batch m
   where lower(regexp_replace(m.code, '\s+', '', 'g')) = lower(regexp_replace(coalesce(p_batch_no, ''), '\s+', '', 'g'))
     and m.status::text <> 'cancelled'
   order by m.created_at desc limit 1
$fn$;
revoke all on function public.wb_match_master(text) from public, anon;
grant execute on function public.wb_match_master(text) to authenticated;   -- the view reads with the viewer's rights; it returns only an id

-- Admin picks an existing main-app batch: batch numbers = its code; the same sheet rows as wb_batch_create_v2.
create or replace function public.wb_batch_create_for_master(p_master uuid, p_note text, p_rows jsonb) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare m master_batch; v uuid;
begin
  perform public.assert_role(array['admin']::app_role[], 'set weighment requirements');
  select * into m from master_batch where id = p_master;
  if not found then raise exception 'Choose a batch.'; end if;
  if m.status::text = 'cancelled' then raise exception 'Batch % is cancelled.', m.code; end if;
  if exists (select 1 from wb_batch where status = 'active' and master_batch_id = p_master) then
    raise exception 'Batch % already has weighment requirements — add the material to it instead.', m.code;
  end if;
  v := public.wb_batch_create_v2(m.code, p_note, p_rows);
  update wb_batch set master_batch_id = p_master where id = v;
  perform public.wb_log('wb_batch_link_master', 'wb_batch', v, jsonb_build_object('master_batch', p_master, 'code', m.code));
  return v;
end $fn$;
revoke all on function public.wb_batch_create_for_master(uuid, text, jsonb) from public, anon;
grant execute on function public.wb_batch_create_for_master(uuid, text, jsonb) to authenticated;

-- ── views: supervisors read (not alerts); wb_v_batch shows the main-app batch ───────────────────────────────────
create or replace view public.wb_v_requirement with (security_invoker = on) as
 SELECT r.id, r.wb_batch_id AS batch_id, b.batch_no AS batch_name, b.status AS batch_status, r.material_code, m.name AS material_name, m.sort,
    r.required_kg, r.tolerance_kg, r.note, COALESCE(r.calc_slip_path, b.calc_slip_path) AS calc_slip_path, r.finished_at, r.finish_note, r.created_at,
    g.received_kg, r.required_kg - g.received_kg AS remaining_kg, g.slips,
        CASE
            WHEN (g.received_kg - r.required_kg) > r.tolerance_kg THEN 'over'::text
            WHEN (r.required_kg - g.received_kg) <= r.tolerance_kg THEN 'complete'::text
            WHEN r.finished_at IS NOT NULL THEN 'short'::text
            ELSE 'receiving'::text
        END AS state,
    (( SELECT count(*) AS count FROM wb_alert a WHERE a.requirement_id = r.id AND a.ack_at IS NULL))::integer AS open_alerts,
    b.note AS batch_note, b.created_at AS batch_created_at, m.weight_unit
   FROM wb_requirement r
     JOIN wb_batch b ON b.id = r.wb_batch_id
     JOIN wb_material m ON m.code = r.material_code
     CROSS JOIN LATERAL ( SELECT COALESCE(sum(s.net_kg), 0::numeric) AS received_kg, count(*)::integer AS slips
           FROM wb_slip s WHERE s.requirement_id = r.id AND s.voided_at IS NULL) g
  WHERE has_role(VARIADIC ARRAY['admin'::app_role, 'gm'::app_role, 'manager'::app_role, 'weighbridge'::app_role, 'supervisor'::app_role]);

create or replace view public.wb_v_slip with (security_invoker = on) as
 SELECT s.id, s.requirement_id, s.ticket_no, s.vehicle_no, s.supplier, s.gross_kg, s.tare_kg, s.net_kg, s.photo_path, s.recorded_at, s.recorded_by,
    s.voided_at, s.voided_by, s.void_reason, s.entry_seq, r.wb_batch_id AS batch_id, b.batch_no AS batch_name, r.material_code, m.name AS material_name,
    p.display_name AS recorded_by_name, pv.display_name AS voided_by_name,
        CASE
            WHEN s.voided_at IS NULL THEN count(*) FILTER (WHERE s.voided_at IS NULL) OVER (PARTITION BY s.requirement_id ORDER BY s.recorded_at, s.entry_seq ROWS UNBOUNDED PRECEDING)
            ELSE NULL::bigint
        END::integer AS slip_no,
        CASE
            WHEN s.voided_at IS NULL THEN r.required_kg - sum(
            CASE WHEN s.voided_at IS NULL THEN s.net_kg ELSE 0::numeric END) OVER (PARTITION BY s.requirement_id ORDER BY s.recorded_at, s.entry_seq ROWS UNBOUNDED PRECEDING)
            ELSE NULL::numeric
        END AS balance_after_kg,
    r.required_kg, r.tolerance_kg
   FROM wb_slip s
     JOIN wb_requirement r ON r.id = s.requirement_id
     JOIN wb_batch b ON b.id = r.wb_batch_id
     JOIN wb_material m ON m.code = r.material_code
     LEFT JOIN profiles p ON p.id = s.recorded_by
     LEFT JOIN profiles pv ON pv.id = s.voided_by
  WHERE has_role(VARIADIC ARRAY['admin'::app_role, 'gm'::app_role, 'manager'::app_role, 'weighbridge'::app_role, 'supervisor'::app_role]);

create or replace view public.wb_v_batch with (security_invoker = on) as
 SELECT b.id, b.batch_no, b.batch_no AS name, b.note, b.calc_slip_path, b.status, b.created_at, b.closed_at, b.close_note,
    pc.display_name AS created_by_name,
    (( SELECT count(*) AS count FROM wb_requirement r WHERE r.wb_batch_id = b.id))::integer AS materials,
    (( SELECT count(*) AS count FROM wb_requirement r WHERE r.wb_batch_id = b.id AND r.finished_at IS NULL))::integer AS unfinished,
    mb.id AS master_batch_id, mb.code AS master_batch_code, mb.status::text AS master_batch_status,
    (b.master_batch_id IS NOT NULL) AS master_linked_by_admin
   FROM wb_batch b
     LEFT JOIN profiles pc ON pc.id = b.created_by
     LEFT JOIN master_batch mb ON mb.id = COALESCE(b.master_batch_id, public.wb_match_master(b.batch_no))
  WHERE has_role(VARIADIC ARRAY['admin'::app_role, 'gm'::app_role, 'manager'::app_role, 'weighbridge'::app_role, 'supervisor'::app_role]);

grant select on public.wb_v_requirement, public.wb_v_slip, public.wb_v_batch to authenticated;
notify pgrst, 'reload schema';
