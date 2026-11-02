-- Rollback for 0135: activity_due exactly as it was live on 25 Sep 2026.
CREATE OR REPLACE FUNCTION public.activity_due(p_activity uuid)
 RETURNS TABLE(target_activity_id uuid, planned_end_at timestamp with time zone, shift_hr numeric, extended_end_at timestamp with time zone, due_at timestamp with time zone, open_ticket boolean, applies boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ba     batch_activity;
  tgt    batch_activity;
  v_grace int;
  v_shift numeric;
  v_open boolean;
  v_applies boolean;
begin
  select * into ba from batch_activity where id = p_activity;
  if not found then return; end if;

  if coalesce(ba.responsible_role::text, '') = 'lab_tech' then
    select x.* into tgt
      from lab_checkpoint_activity lca
      join batch_activity x on x.master_batch_id = ba.master_batch_id and x.code = lca.gates_activity_code
     where lca.process_activity_id = ba.process_activity_id
     order by x.instance_no limit 1;
    if not found then tgt := ba; end if;
  else
    tgt := ba;
  end if;

  with recursive anc(id) as (
    select tgt.id
    union
    select pred.id
      from anc
      join batch_activity cur on cur.id = anc.id
      join gate_rule g on g.process_activity_id = cur.process_activity_id
                      and g.phase = 'entry' and g.kind = 'PREDECESSOR' and g.is_enabled
      join batch_activity pred
        on pred.master_batch_id = cur.master_batch_id
       and pred.code in (select jsonb_array_elements_text(g.config->'activity_codes'))
       and (coalesce(g.predecessor_binding, 'ALL_INSTANCES') <> 'SAME_SCOPE_INSTANCE' or pred.instance_no = cur.instance_no)
       and coalesce(pred.responsible_role::text, '') <> 'lab_tech'
  )
  select coalesce(sum(er.approved_extension_hr), 0) into v_shift
    from extension_request er
   where (er.batch_activity_id in (select id from anc) or er.batch_activity_id = ba.id)
     and public.extension_is_effective(er.status);

  v_open := exists (select 1 from extension_request er where er.batch_activity_id = ba.id and er.status = 'REQUESTED');
  select p.late_grace_min into v_grace from extension_policy p where p.id;
  v_grace := coalesce(v_grace, 30);

  v_applies := not ba.is_hold
    and not public.batch_clock_waived(ba.master_batch_id)
    and not ba.before_tracking
    and ba.state::text in ('READY', 'IN_PROGRESS', 'RETURNED')
    and tgt.planned_end_at is not null;

  return query select tgt.id, tgt.planned_end_at, v_shift,
    tgt.planned_end_at + make_interval(secs => (v_shift * 3600)::int),
    tgt.planned_end_at + make_interval(secs => (v_shift * 3600)::int) + make_interval(mins => v_grace),
    v_open, v_applies;
end;
$function$
;
