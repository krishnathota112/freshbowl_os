-- Display/input preferences only. All recorded weights remain canonical kg.
alter table public.wb_material add column weight_unit text not null default 't'
 check (weight_unit in ('kg','t'));
update public.wb_material set weight_unit='kg' where lower(name) like '%ammonium%sulph%';

create or replace function public.wb_material_set_unit(p_material text,p_unit text) returns void
language plpgsql security definer set search_path=public as $fn$
declare old_unit text;
begin
 perform public.assert_role(array['admin']::app_role[],'set a material weight unit');
 if p_unit is null or p_unit not in ('kg','t') then raise exception 'Choose kg or tons.';end if;
 select weight_unit into old_unit from wb_material where code=p_material for update;
 if not found then raise exception 'No such material.';end if;
 update wb_material set weight_unit=p_unit where code=p_material;
 insert into audit_event(actor_id,actor_role,action,entity_table,entity_id,before_state,after_state,reason)
 values(auth.uid(),current_app_role(),'wb_material_unit','wb_material',p_material,
 jsonb_build_object('weight_unit',old_unit),jsonb_build_object('weight_unit',p_unit),'Admin weight display/input preference');
end $fn$;
revoke all on function public.wb_material_set_unit(text,text) from public,anon;
grant execute on function public.wb_material_set_unit(text,text) to authenticated;

create function public.wb_batch_create_v2(p_batch_no text,p_note text,p_rows jsonb) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare id uuid;r jsonb;
begin
 id:=public.wb_batch_create(p_batch_no,p_note,p_rows);
 for r in select value from jsonb_array_elements(p_rows) loop
  if r ? 'weight_unit' then perform public.wb_material_set_unit(r->>'material',r->>'weight_unit');end if;
 end loop;
 return id;
end $fn$;
create function public.wb_requirement_add_v2(p_batch uuid,p_material text,p_required_kg numeric,p_tolerance_kg numeric,p_note text,p_unit text) returns uuid
language plpgsql security definer set search_path=public as $fn$
declare id uuid;
begin
 id:=public.wb_requirement_add(p_batch,p_material,p_required_kg,p_tolerance_kg,p_note);
 perform public.wb_material_set_unit(p_material,p_unit);return id;
end $fn$;
create function public.wb_requirement_update_v2(p_req uuid,p_required_kg numeric,p_tolerance_kg numeric,p_note text,p_unit text) returns void
language plpgsql security definer set search_path=public as $fn$
declare material text;
begin
 perform public.wb_requirement_update(p_req,p_required_kg,p_tolerance_kg,p_note);
 select material_code into material from wb_requirement where id=p_req;
 perform public.wb_material_set_unit(material,p_unit);
end $fn$;
revoke all on function public.wb_batch_create_v2(text,text,jsonb),public.wb_requirement_add_v2(uuid,text,numeric,numeric,text,text),public.wb_requirement_update_v2(uuid,numeric,numeric,text,text) from public,anon;
grant execute on function public.wb_batch_create_v2(text,text,jsonb),public.wb_requirement_add_v2(uuid,text,numeric,numeric,text,text),public.wb_requirement_update_v2(uuid,numeric,numeric,text,text) to authenticated;

create or replace view public.wb_v_requirement with (security_invoker=on) as
select r.id,r.wb_batch_id as batch_id,b.batch_no as batch_name,b.status as batch_status,r.material_code,m.name as material_name,m.sort,
 r.required_kg,r.tolerance_kg,r.note,coalesce(r.calc_slip_path,b.calc_slip_path) as calc_slip_path,r.finished_at,r.finish_note,r.created_at,
 g.received_kg,r.required_kg-g.received_kg as remaining_kg,g.slips,
 case when g.received_kg-r.required_kg>r.tolerance_kg then 'over'
 when r.required_kg-g.received_kg<=r.tolerance_kg then 'complete'
 when r.finished_at is not null then 'short' else 'receiving' end as state,
 (select count(*) from wb_alert a where a.requirement_id=r.id and a.ack_at is null)::int as open_alerts,
 b.note as batch_note,b.created_at as batch_created_at,m.weight_unit
from wb_requirement r join wb_batch b on b.id=r.wb_batch_id join wb_material m on m.code=r.material_code
cross join lateral(select coalesce(sum(s.net_kg),0) as received_kg,count(*)::int as slips
 from wb_slip s where s.requirement_id=r.id and s.voided_at is null) g
where public.has_role(variadic array['admin','gm','manager','weighbridge']::app_role[]);
notify pgrst,'reload schema';
