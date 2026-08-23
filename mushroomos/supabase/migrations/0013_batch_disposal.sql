-- 0013 · A3 support — cancelling a batch, as a server transition.
--
-- WHY THIS EXISTS
--
-- Three batches were in the project before A2: `batch` (a test artefact — that is its whole code),
-- `MB-2026-08-20` and `MB-2026-09-20`. None of them has an H0, because they were generated before
-- `master_batch.start_at` existed, and `set_batch_start_at` is draft-only by design — activation
-- freezes the baseline, and moving H0 on a running batch would rewrite the history every actual
-- timestamp is measured against. So the active one CANNOT be repaired.
--
-- A3 replaces all three. Disposing of them needs a transition, and `batch_status` already carries
-- `cancelled`, and `activity_state` already carries `CANCELLED` — the vocabulary exists and nothing
-- could reach it. Rule 6: every state transition is a SECURITY DEFINER RPC. A seed reaching into
-- `batch_activity.state` directly would be the frontend-decides-state defect wearing a different
-- hat, and it would slip past B1's writer test because that test scans functions.
--
-- NOTHING IS DELETED. The rows, their audit events and the one genuinely completed activity survive.
-- A cancelled batch is excluded from the tower by status, not by disappearing.
--
-- IDEMPOTENT: `scripts/db.mjs` replays every migration on every run.

-- ─────────────────────────────────────────────────────────────────────────────
-- cancel_batch · the batch stops, and every activity that had not finished stops with it.
--
-- COMPLETED and SKIPPED rows are left alone: they record what actually happened, and rewriting them
-- would destroy the only evidence that anything did. Everything else becomes CANCELLED carrying the
-- reason, which the 0006 CHECK requires of any non-actionable state.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cancel_batch(p_batch uuid, p_reason text)
returns table (activities_cancelled int)
language plpgsql security definer set search_path = public as $$
declare
  b master_batch;
  n int := 0;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Cancelling a batch needs a reason — it is a decision, and the record has to say whose and why';
  end if;

  select * into b from master_batch where id = p_batch;
  if not found then raise exception 'No such batch: %', p_batch; end if;

  if b.status = 'cancelled' then
    return query select 0;
    return;
  end if;
  if b.status = 'closed' then
    raise exception 'Batch % is closed. A finished batch is not cancelled retrospectively', b.code;
  end if;

  update master_batch set status = 'cancelled' where id = p_batch;

  update batch_activity
     set state = 'CANCELLED',
         blocked_reason = p_reason
   where master_batch_id = p_batch
     and state not in ('COMPLETED','SKIPPED','CANCELLED');
  get diagnostics n = row_count;

  insert into audit_event (actor_id, actor_role, action, entity_table, entity_id, after_state, reason)
  values (auth.uid(), public.current_app_role(), 'cancel_batch', 'master_batch', p_batch::text,
          jsonb_build_object('status', 'cancelled', 'activities_cancelled', n), p_reason);

  return query select n;
end;
$$;

revoke execute on function public.cancel_batch(uuid, text) from anon;
grant execute on function public.cancel_batch(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A cancelled batch must not reach the tower, the rail or a work queue.
--
-- A view rather than a rule each screen remembers: `UI_CONTROL_TOWER_SPEC §9` counts running
-- batches, and a cancelled one is not running. `master_batch` stays readable as the record.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_live_batch as
select mb.*
from public.master_batch mb
where mb.status in ('draft','active');

grant select on public.v_live_batch to authenticated;
