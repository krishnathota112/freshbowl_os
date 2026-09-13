-- ─────────────────────────────────────────────────────────────────────────────
-- 0036 · The extension register.  (F2)
--
-- An extension is an AUTHORISATION TO DIFFER FROM THE PLAN. It is not an edit to
-- the plan. Nothing in this migration writes planned_start_at, planned_end_at,
-- baseline_start_hour or baseline_end_hour — 0034's trigger would refuse it if it
-- tried, and `tests/extensionRegister.test.ts` proves that it does not.
--
-- FOUR NUMBERS, SHOWN SEPARATELY, FOREVER
--
--     planned end                12:00      the frozen baseline
--     approved extension         +2h        this register
--     authorised expectation     14:00      derived, never stored as truth
--     actual end                 13:40      the execution record
--
--     original variance          +1h40m     still visible, and still the truth
--     within authorisation       yes
--
-- If an extension were applied by moving planned_end_at to 14:00, the +1h40m
-- would vanish and the system would have lied about its own history. So the
-- extension is a THIRD NUMBER beside the other two, and `v_activity_expectation`
-- is the only place the four are combined.
--
-- WHAT THE FACTORY HAS NOT YET DECIDED
--   Whether GM approval is always required, whether there is a cap on the hours
--   that may be asked for, whether evidence is required, whether a request may be
--   made after the activity has finished, how many extensions one activity may
--   carry, and how long an undecided request stays alive.
--
--   None of those are invented here. Every one is a column of `extension_policy`
--   with a stated default and a TBD marker, so the answer is a configuration
--   change and not a migration. The defaults follow the dictated diagram —
--   operator requests, manager approves, GM approves — and nothing further.
-- ─────────────────────────────────────────────────────────────────────────────


do $$ begin
  create type extension_status as enum (
    'REQUESTED',          -- awaiting the first decision
    'MANAGER_APPROVED',   -- manager said yes; still awaiting GM if GM is required
    'MANAGER_REJECTED',   -- terminal
    'GM_APPROVED',        -- terminal, and effective
    'GM_REJECTED',        -- terminal
    'EXPIRED',            -- terminal, decided by nobody within the policy window
    'CANCELLED'           -- terminal, withdrawn by the requester before any decision
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type extension_decision as enum ('approved','rejected');
exception when duplicate_object then null; end $$;


-- ── 1 · The policy. Every factory rule that is still open lives here. ────────
-- One row. `id` is fixed so the row can be addressed without a lookup and so a
-- second row cannot silently appear and change the answer.

create table if not exists public.extension_policy (
  id                        boolean primary key default true check (id),

  -- WHO MAY ASK. The dictated flow says the operator. Supervisor and lab
  -- technician are included because both own activities in PROCESS-2026B.
  requester_roles           app_role[] not null
                              default array['operator','supervisor','lab_tech']::app_role[],

  -- WHO MUST APPROVE. Both true follows the dictated chain
  -- operator -> manager -> GM. [TBD-EXT-1] the factory has not said whether a
  -- short extension may stop at the manager.
  manager_approval_required boolean not null default true,
  gm_approval_required      boolean not null default true,

  -- ORDER. True means the GM may not decide before the manager has. False lets
  -- either decide first. [TBD-EXT-2]
  strict_approval_order     boolean not null default true,

  -- HOW LONG MAY BE ASKED FOR. NULL = no stated limit. [TBD-EXT-3] — the factory
  -- has never named a cap, and inventing one would block a real request.
  max_requested_hr          numeric,

  -- EVIDENCE. [TBD-EXT-4] — no source says a photograph is required to ask for
  -- more time, so the default does not require one.
  evidence_required         boolean not null default false,

  -- LATENESS. May a request be made after the planned end has already passed?
  -- True, deliberately: an operator notices they are late BECAUSE they are late,
  -- and a system that refused would simply not be used.
  allow_late_request        boolean not null default true,

  -- May a request be made after the activity is finished? False: that is a
  -- request to rewrite history, which is what a deviation is for. [TBD-EXT-5]
  allow_after_completion    boolean not null default false,

  -- HOW MANY. One open request at a time, so two approvers cannot be asked the
  -- same question twice. NULL total = no limit on how many an activity may
  -- accumulate over its life. [TBD-EXT-6]
  max_open_per_activity     int not null default 1,
  max_total_per_activity    int,

  -- EXPIRY. NULL = a request waits forever. [TBD-EXT-7] — the factory has not
  -- said, and silently expiring a request nobody answered would lose the fact
  -- that nobody answered it.
  request_expiry_hr         numeric,

  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles(id)
);

insert into public.extension_policy (id) values (true) on conflict (id) do nothing;

alter table public.extension_policy enable row level security;

drop policy if exists extension_policy_read on public.extension_policy;
create policy extension_policy_read on public.extension_policy
  for select to authenticated using (true);

drop policy if exists extension_policy_write on public.extension_policy;
create policy extension_policy_write on public.extension_policy
  for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

comment on table public.extension_policy is
  'The configurable half of the extension model. Every factory rule that is still open is a '
  'column here with a TBD marker, so answering one is a settings change, not a migration. 0036 / F2.';


-- ── 2 · The register itself. ────────────────────────────────────────────────
-- Additive only. A row is created by a request and then decided; nothing in it
-- is ever rewritten, and section 5 enforces that.

create table if not exists public.extension_request (
  id                     uuid primary key default gen_random_uuid(),
  master_batch_id        uuid not null references public.master_batch(id) on delete cascade,
  batch_activity_id      uuid not null references public.batch_activity(id) on delete cascade,

  -- THE REQUEST
  requested_by           uuid references public.profiles(id),
  requested_by_role      app_role,
  requested_at           timestamptz not null default now(),
  requested_extension_hr numeric not null check (requested_extension_hr > 0),
  requested_reason       text not null check (length(trim(requested_reason)) > 0),
  evidence_id            uuid references public.evidence_media(id),

  -- THE CONTEXT, FROZEN AT REQUEST TIME.
  -- Copied so the record explains itself years later without re-deriving the
  -- state of a batch that has since finished. This is a snapshot of the Plan
  -- register, never a second copy of it that could drift.
  planned_end_at_at_request timestamptz,
  activity_state_at_request text,

  -- MANAGER
  manager_decision       extension_decision,
  manager_decided_by     uuid references public.profiles(id),
  manager_decided_at     timestamptz,
  manager_granted_hr     numeric check (manager_granted_hr is null or manager_granted_hr > 0),
  manager_reason         text,

  -- GM
  gm_decision            extension_decision,
  gm_decided_by          uuid references public.profiles(id),
  gm_decided_at          timestamptz,
  gm_granted_hr          numeric check (gm_granted_hr is null or gm_granted_hr > 0),
  gm_reason              text,

  -- THE OUTCOME. Server-set, every one of them. A client may not write this
  -- table at all — there is no grant and no write policy.
  status                 extension_status not null default 'REQUESTED',
  approved_extension_hr  numeric check (approved_extension_hr is null or approved_extension_hr > 0),
  effective_from         timestamptz,
  effective_to           timestamptz,

  cancelled_at           timestamptz,
  cancelled_by           uuid references public.profiles(id),
  cancel_reason          text,
  expired_at             timestamptz,

  -- A decision must name who made it and when. Enforced here rather than in the
  -- RPCs so a future writer cannot bypass it — the same shape `deviation` uses.
  constraint extension_manager_decision_attributed check (
    manager_decision is null
    or (manager_decided_by is not null and manager_decided_at is not null)
  ),
  constraint extension_gm_decision_attributed check (
    gm_decision is null
    or (gm_decided_by is not null and gm_decided_at is not null)
  ),
  -- An approved extension has a number and a window. An unapproved one has none.
  constraint extension_approved_has_hours check (
    (status = 'GM_APPROVED') = (approved_extension_hr is not null)
  ),
  constraint extension_approved_has_window check (
    approved_extension_hr is null
    or (effective_from is not null and effective_to is not null and effective_to > effective_from)
  ),
  constraint extension_cancel_attributed check (
    status <> 'CANCELLED'
    or (cancelled_at is not null and coalesce(trim(cancel_reason), '') <> '')
  )
);

create index if not exists extension_request_activity_idx
  on public.extension_request (batch_activity_id, status);
create index if not exists extension_request_batch_idx
  on public.extension_request (master_batch_id, status);

-- At most one undecided request per activity, so two approvers are never asked
-- the same question twice. A partial unique index rather than a policy check,
-- because a race between two operators must be refused by the database.
create unique index if not exists extension_request_one_open
  on public.extension_request (batch_activity_id)
  where status in ('REQUESTED', 'MANAGER_APPROVED');

alter table public.extension_request enable row level security;

drop policy if exists extension_request_read on public.extension_request;
create policy extension_request_read on public.extension_request
  for select to authenticated using (true);

-- No write policy, deliberately. Every write goes through an RPC in section 4.
revoke insert, update, delete on public.extension_request from anon, authenticated;

comment on table public.extension_request is
  'Authorisation to differ from the plan. Additive: never rewrites the baseline, never rewrites '
  'the execution record. The approved hours are a THIRD number beside planned end and actual '
  'end, so the original variance stays visible. 0036 / F2.';


-- ── 3 · Is a request effective, and what does it authorise? ─────────────────
-- A pure function so the rule lives in exactly one place, and so the policy can
-- change the answer without a migration.

create or replace function public.extension_is_effective(p_status extension_status)
returns boolean language sql stable as $fn$
  select case
    when p_status = 'GM_APPROVED' then true
    -- If the factory later says the GM is not required, a manager's approval is
    -- the last one needed and the request is effective at that point.
    when p_status = 'MANAGER_APPROVED'
      then not (select gm_approval_required from public.extension_policy where extension_policy.id)
    else false
  end;
$fn$;

comment on function public.extension_is_effective(extension_status) is
  'Whether a request has every approval the policy requires. Reads extension_policy, so answering '
  'TBD-EXT-1 is a settings change. 0036 / F2.';


-- ── 4 · The four transitions. One RPC each, each asserting its own role. ────
-- A client may request, and may cancel its own request. It may not decide, may
-- not set a status, may not stamp a time, and may not choose the granted hours.

create or replace function public.request_extension(
  p_activity uuid,
  p_hours numeric,
  p_reason text,
  p_evidence uuid default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  ba  batch_activity;
  b   master_batch;
  pol extension_policy;
  n   int;
  new_id uuid;
begin
  select * into pol from extension_policy where extension_policy.id;
  perform public.assert_role(pol.requester_roles, 'Requesting an extension');

  select * into ba from batch_activity where id = p_activity;
  if not found then raise exception 'No such activity: %', p_activity; end if;
  select * into b from master_batch where id = ba.master_batch_id;

  if b.status <> 'active' then
    raise exception 'Batch % is % — an extension only means something on a running batch', b.code, b.status;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'An extension needs a reason — it is the whole record of why the plan was missed';
  end if;

  if p_hours is null or p_hours <= 0 then
    raise exception 'An extension must ask for a positive number of hours';
  end if;

  if pol.max_requested_hr is not null and p_hours > pol.max_requested_hr then
    raise exception 'An extension may not exceed % hours (extension_policy.max_requested_hr)',
      pol.max_requested_hr;
  end if;

  if pol.evidence_required and p_evidence is null then
    raise exception 'Policy requires evidence with an extension request (extension_policy.evidence_required)';
  end if;

  if not pol.allow_after_completion and ba.actual_end is not null then
    raise exception
      'Activity % has already finished. Extending it now would be rewriting history — record a deviation instead.',
      ba.code;
  end if;

  if not pol.allow_late_request
     and ba.planned_end_at is not null and now() > ba.planned_end_at then
    raise exception 'The planned end of % has passed and late requests are not permitted', ba.code;
  end if;

  if pol.max_total_per_activity is not null then
    select count(*) into n from extension_request where batch_activity_id = p_activity;
    if n >= pol.max_total_per_activity then
      raise exception 'Activity % already carries % extension request(s), the configured maximum',
        ba.code, n;
    end if;
  end if;

  -- The one-open-request rule is the partial unique index; this turns its
  -- constraint error into a sentence a person can act on.
  select count(*) into n from extension_request
   where batch_activity_id = p_activity and status in ('REQUESTED','MANAGER_APPROVED');
  if n >= pol.max_open_per_activity then
    raise exception 'Activity % already has an extension request awaiting a decision', ba.code;
  end if;

  insert into extension_request (
    master_batch_id, batch_activity_id,
    requested_by, requested_by_role, requested_extension_hr, requested_reason, evidence_id,
    planned_end_at_at_request, activity_state_at_request, status
  ) values (
    ba.master_batch_id, p_activity,
    auth.uid(), public.current_app_role(), p_hours, trim(p_reason), p_evidence,
    ba.planned_end_at, ba.state::text, 'REQUESTED'
  ) returning extension_request.id into new_id;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (ba.master_batch_id, p_activity, 'manager', 'alert',
          format('Extension requested on %s: %s hours', ba.title, p_hours), trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'request_extension', 'extension_request', new_id::text,
          jsonb_build_object('hours', p_hours, 'activity', p_activity, 'status', 'REQUESTED'),
          trim(p_reason));

  return new_id;
end;
$fn$;


create or replace function public.manager_decide_extension(
  p_request uuid,
  p_approve boolean,
  p_reason text,
  p_granted_hr numeric default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  er  extension_request;
  pol extension_policy;
  granted numeric;
begin
  perform public.assert_role(array['manager']::app_role[], 'Deciding an extension as manager');

  select * into pol from extension_policy where extension_policy.id;
  select * into er from extension_request where id = p_request for update;
  if not found then raise exception 'No such extension request: %', p_request; end if;

  if er.status <> 'REQUESTED' then
    raise exception 'Extension request is % — only a REQUESTED one awaits a manager', er.status;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason';
  end if;

  -- A manager may grant LESS than was asked for, never more: approving more time
  -- than anyone requested is a decision nobody made.
  granted := coalesce(p_granted_hr, er.requested_extension_hr);
  if granted > er.requested_extension_hr then
    raise exception 'A manager may approve at most the % hours requested', er.requested_extension_hr;
  end if;
  if granted <= 0 then
    raise exception 'An approved extension must be a positive number of hours';
  end if;

  if not p_approve then
    update extension_request set
      manager_decision = 'rejected', manager_decided_by = auth.uid(),
      manager_decided_at = now(), manager_reason = trim(p_reason),
      status = 'MANAGER_REJECTED'
    where id = p_request;
  else
    update extension_request set
      manager_decision = 'approved', manager_decided_by = auth.uid(),
      manager_decided_at = now(), manager_reason = trim(p_reason),
      manager_granted_hr = granted,
      status = 'MANAGER_APPROVED'
    where id = p_request;

    -- If the policy does not require the GM, the manager's yes was the last one
    -- needed and the authorisation takes effect now.
    if not pol.gm_approval_required then
      perform public.fn_make_extension_effective(p_request, granted);
    end if;
  end if;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (er.master_batch_id, er.batch_activity_id,
          case when p_approve and pol.gm_approval_required then 'gm' else er.requested_by_role end,
          'alert',
          format('Extension %s by manager', case when p_approve then 'approved' else 'rejected' end),
          trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'manager_decide_extension', 'extension_request',
          p_request::text,
          jsonb_build_object('approve', p_approve, 'granted_hr', case when p_approve then granted end),
          trim(p_reason));
end;
$fn$;


create or replace function public.gm_decide_extension(
  p_request uuid,
  p_approve boolean,
  p_reason text,
  p_granted_hr numeric default null
) returns void language plpgsql security definer set search_path = public as $fn$
declare
  er  extension_request;
  pol extension_policy;
  ceiling numeric;
  granted numeric;
begin
  perform public.assert_role(array['gm']::app_role[], 'Deciding an extension as GM');

  select * into pol from extension_policy where extension_policy.id;
  select * into er from extension_request where id = p_request for update;
  if not found then raise exception 'No such extension request: %', p_request; end if;

  if pol.strict_approval_order and pol.manager_approval_required then
    if er.status <> 'MANAGER_APPROVED' then
      raise exception
        'Extension request is % — the manager decides first (extension_policy.strict_approval_order)',
        er.status;
    end if;
  elsif er.status not in ('REQUESTED','MANAGER_APPROVED') then
    raise exception 'Extension request is % — it is already decided', er.status;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason';
  end if;

  -- The GM cannot exceed what the manager allowed, and neither can exceed what
  -- was asked for. Approval only ever narrows.
  ceiling := least(coalesce(er.manager_granted_hr, er.requested_extension_hr),
                   er.requested_extension_hr);
  granted := coalesce(p_granted_hr, ceiling);
  if granted > ceiling then
    raise exception 'The GM may approve at most % hours here', ceiling;
  end if;
  if granted <= 0 then
    raise exception 'An approved extension must be a positive number of hours';
  end if;

  if not p_approve then
    update extension_request set
      gm_decision = 'rejected', gm_decided_by = auth.uid(),
      gm_decided_at = now(), gm_reason = trim(p_reason),
      status = 'GM_REJECTED'
    where id = p_request;
  else
    update extension_request set
      gm_decision = 'approved', gm_decided_by = auth.uid(),
      gm_decided_at = now(), gm_reason = trim(p_reason),
      gm_granted_hr = granted
    where id = p_request;
    perform public.fn_make_extension_effective(p_request, granted);
  end if;

  insert into notification (master_batch_id, batch_activity_id, to_role, kind, message, reason, sent_by)
  values (er.master_batch_id, er.batch_activity_id, er.requested_by_role, 'alert',
          format('Extension %s by GM', case when p_approve then 'approved' else 'rejected' end),
          trim(p_reason), auth.uid());

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'gm_decide_extension', 'extension_request',
          p_request::text,
          jsonb_build_object('approve', p_approve, 'granted_hr', case when p_approve then granted end),
          trim(p_reason));
end;
$fn$;


-- The only writer of the effective window. Private: no client grant, and every
-- caller is one of the two decision RPCs above.
create or replace function public.fn_make_extension_effective(p_request uuid, p_hours numeric)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  er extension_request;
  base timestamptz;
begin
  select * into er from extension_request where id = p_request;

  -- The window runs from the PLANNED end, not from the moment of approval. An
  -- extension approved at 13:00 on a 12:00 activity authorises until 14:00, not
  -- until 15:00 — otherwise a late approval would quietly buy extra time.
  select coalesce(er.planned_end_at_at_request, ba.planned_end_at, now())
    into base
    from batch_activity ba where ba.id = er.batch_activity_id;

  update extension_request set
    approved_extension_hr = p_hours,
    effective_from = base,
    effective_to   = base + make_interval(secs => (p_hours * 3600)::int),
    status = 'GM_APPROVED'
  where id = p_request;
end;
$fn$;

revoke execute on function public.fn_make_extension_effective(uuid, numeric)
  from public, anon, authenticated;


create or replace function public.cancel_extension(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $fn$
declare er extension_request;
begin
  select * into er from extension_request where id = p_request for update;
  if not found then raise exception 'No such extension request: %', p_request; end if;

  -- Only the person who asked, and only while nobody has answered. A supervisor
  -- who wants a request gone rejects it; withdrawing somebody else's request
  -- would erase the fact that it was made.
  if er.requested_by is distinct from auth.uid() then
    raise exception 'Only the requester may cancel an extension request';
  end if;
  if er.status <> 'REQUESTED' then
    raise exception 'Extension request is % — it can no longer be withdrawn', er.status;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A cancellation needs a reason';
  end if;

  update extension_request set
    status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
    cancel_reason = trim(p_reason)
  where id = p_request;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, reason)
  values (auth.uid(), public.current_app_role(), 'cancel_extension', 'extension_request',
          p_request::text, trim(p_reason));
end;
$fn$;


create or replace function public.expire_extensions()
returns int language plpgsql security definer set search_path = public as $fn$
declare
  pol extension_policy;
  n int := 0;
begin
  select * into pol from extension_policy where extension_policy.id;
  -- NULL means a request waits forever, which is the honest default: silently
  -- expiring a request nobody answered would lose the fact that nobody answered.
  if pol.request_expiry_hr is null then return 0; end if;

  update extension_request set status = 'EXPIRED', expired_at = now()
   where status in ('REQUESTED','MANAGER_APPROVED')
     and requested_at < now() - make_interval(secs => (pol.request_expiry_hr * 3600)::int);
  get diagnostics n = row_count;
  return n;
end;
$fn$;


-- ── 5 · A decided request is a record, not a document. ──────────────────────
-- Everything about the request and everything about a decision already made is
-- write-once. Only the fields a LATER stage sets may still be written.

create or replace function public.fn_extension_is_append_only()
returns trigger language plpgsql as $fn$
begin
  if new.id                     is distinct from old.id
  or new.master_batch_id        is distinct from old.master_batch_id
  or new.batch_activity_id      is distinct from old.batch_activity_id
  or new.requested_by           is distinct from old.requested_by
  or new.requested_at           is distinct from old.requested_at
  or new.requested_extension_hr is distinct from old.requested_extension_hr
  or new.requested_reason       is distinct from old.requested_reason
  or new.planned_end_at_at_request is distinct from old.planned_end_at_at_request
  then
    raise exception 'An extension request is a record of what was asked. It cannot be rewritten.'
      using errcode = 'check_violation';
  end if;

  if old.manager_decision is not null
     and (new.manager_decision   is distinct from old.manager_decision
       or new.manager_decided_by is distinct from old.manager_decided_by
       or new.manager_decided_at is distinct from old.manager_decided_at
       or new.manager_granted_hr is distinct from old.manager_granted_hr
       or new.manager_reason     is distinct from old.manager_reason)
  then
    raise exception 'The manager decision on % is already recorded and cannot be changed.', old.id
      using errcode = 'check_violation';
  end if;

  if old.gm_decision is not null
     and (new.gm_decision   is distinct from old.gm_decision
       or new.gm_decided_by is distinct from old.gm_decided_by
       or new.gm_decided_at is distinct from old.gm_decided_at
       or new.gm_granted_hr is distinct from old.gm_granted_hr
       or new.gm_reason     is distinct from old.gm_reason)
  then
    raise exception 'The GM decision on % is already recorded and cannot be changed.', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_extension_is_append_only on public.extension_request;
create trigger trg_extension_is_append_only
  before update on public.extension_request
  for each row execute function public.fn_extension_is_append_only();


-- ── 6 · The four numbers, side by side. ─────────────────────────────────────
-- The ONLY place plan, authorisation and actual are combined. Everything a
-- screen needs to say "late, but authorised" without computing anything itself.

create or replace view public.v_activity_expectation as
select
  ba.id                     as activity_id,
  ba.master_batch_id,
  ba.code,
  ba.title,
  ba.scope_label,
  ba.rel_day,

  -- 1 · PLAN, frozen at activation and never moved
  ba.planned_start_at,
  ba.planned_end_at,

  -- 2 · AUTHORISATION, the sum of every effective extension on this activity
  coalesce(x.approved_hr, 0)                                   as approved_extension_hr,
  coalesce(x.extension_count, 0)                               as approved_extension_count,

  -- 3 · AUTHORISED EXPECTATION, derived — stored nowhere
  case when ba.planned_end_at is null then null
       else ba.planned_end_at
            + make_interval(secs => (coalesce(x.approved_hr, 0) * 3600)::int)
  end                                                          as authorised_end_at,

  -- 4 · ACTUAL
  ba.actual_start,
  ba.actual_end,

  -- The variance against the ORIGINAL plan. This is the number an extension must
  -- never be allowed to erase.
  case when ba.actual_end is null or ba.planned_end_at is null then null
       else round(extract(epoch from (ba.actual_end - ba.planned_end_at)) / 60)::int
  end                                                          as original_variance_minutes,

  -- Whether the overrun was authorised. Three-valued on purpose: NULL means the
  -- activity has not finished, and "not yet late" is not the same as "on time".
  case
    when ba.actual_end is null or ba.planned_end_at is null then null
    else ba.actual_end <= ba.planned_end_at
         + make_interval(secs => (coalesce(x.approved_hr, 0) * 3600)::int)
  end                                                          as within_authorisation,

  -- Anything still waiting on a decision, so a manager screen needs no second query.
  coalesce(p.pending_count, 0)                                 as pending_extension_count
from public.batch_activity ba
left join lateral (
  select sum(er.approved_extension_hr) as approved_hr,
         count(*)                      as extension_count
    from public.extension_request er
   where er.batch_activity_id = ba.id
     and public.extension_is_effective(er.status)
) x on true
left join lateral (
  select count(*) as pending_count
    from public.extension_request er
   where er.batch_activity_id = ba.id
     and er.status in ('REQUESTED','MANAGER_APPROVED')
) p on true;

grant select on public.v_activity_expectation to authenticated;

comment on view public.v_activity_expectation is
  'Plan, authorisation, authorised expectation and actual — four numbers, never collapsed into '
  'one. `original_variance_minutes` is measured against the FROZEN plan, so an approved extension '
  'explains an overrun without hiding it. 0036 / F2.';


create or replace view public.v_extension_request as
select
  er.id,
  er.master_batch_id,
  mb.code                    as batch_code,
  er.batch_activity_id,
  ba.title                   as activity_title,
  ba.scope_label,
  er.status,
  public.extension_is_effective(er.status) as is_effective,
  er.requested_extension_hr,
  er.approved_extension_hr,
  er.requested_reason,
  er.requested_at,
  rq.display_name            as requested_by_name,
  er.requested_by_role,
  er.manager_decision, er.manager_decided_at, er.manager_reason,
  mg.display_name            as manager_name,
  er.gm_decision, er.gm_decided_at, er.gm_reason,
  gm.display_name            as gm_name,
  er.effective_from, er.effective_to,
  er.cancel_reason, er.cancelled_at, er.expired_at,
  er.evidence_id,
  -- The plan as it stood when the request was made, so the record reads on its own.
  er.planned_end_at_at_request,
  ba.planned_end_at          as planned_end_at_now,
  ba.actual_end
from public.extension_request er
join public.master_batch mb on mb.id = er.master_batch_id
join public.batch_activity ba on ba.id = er.batch_activity_id
left join public.profiles rq on rq.id = er.requested_by
left join public.profiles mg on mg.id = er.manager_decided_by
left join public.profiles gm on gm.id = er.gm_decided_by;

grant select on public.v_extension_request to authenticated;


-- ── 7 · Grants. Request and withdraw from a client; decide from a client;
--        never write the table, never set a status, never stamp a time. ──────

revoke all on function public.request_extension(uuid, numeric, text, uuid) from public, anon;
revoke all on function public.manager_decide_extension(uuid, boolean, text, numeric) from public, anon;
revoke all on function public.gm_decide_extension(uuid, boolean, text, numeric) from public, anon;
revoke all on function public.cancel_extension(uuid, text) from public, anon;
revoke all on function public.expire_extensions() from public, anon;

grant execute on function public.request_extension(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.manager_decide_extension(uuid, boolean, text, numeric) to authenticated;
grant execute on function public.gm_decide_extension(uuid, boolean, text, numeric) to authenticated;
grant execute on function public.cancel_extension(uuid, text) to authenticated;
grant execute on function public.expire_extensions() to authenticated;
