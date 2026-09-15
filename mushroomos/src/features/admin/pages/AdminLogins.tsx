import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '../../../shared/api/client';
import { useAuth } from '../../../shared/auth/auth';
import { PageHeading } from '../../../shared/ui/layout/PageHeading';
import { Chip, EmptyState, Skeleton } from '../../../shared/ui/primitives';
import { humanError } from '../../../shared/utils/humanError';

/**
 * Admin · logins (0104). Create a login for each person, set or reset passwords, change roles, and deactivate
 * people who leave. Only an active Admin can use these server functions; passwords are never shown or stored in
 * the audit trail.
 */
type Login = {
  user_id: string;
  email: string | null;
  display_name: string;
  role: string;
  shift: string | null;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

const ROLES = [
  { value: 'supervisor', label: 'Supervisor', hint: 'Field work on the phone app' },
  { value: 'lab_tech', label: 'Lab', hint: 'Lab checks on the phone app' },
  { value: 'gm', label: 'GM', hint: 'Approvals, progress and people' },
  { value: 'admin', label: 'Admin', hint: 'Batches, tickets and logins (web)' },
  { value: 'manager', label: 'Manager', hint: 'Read-only overview (web)' },
];
const roleLabel = (r: string) => (r === 'operator' ? 'Supervisor' : ROLES.find((x) => x.value === r)?.label ?? r);

const inputCls = 'w-full rounded-lg border bg-surface px-3 text-[15px]';
const inputStyle = { minHeight: 48, borderColor: 'var(--line-2)' };

function errText(e: unknown): string {
  const h = humanError(e);
  return h.detail || h.title || (e as Error).message;
}

export function AdminLogins() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['admin-logins'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users');
      if (error) throw error;
      return (data ?? []) as Login[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-logins'] });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const rows = (list.data ?? []).filter((r) => filter === 'all' || r.is_active);

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <PageHeading
        title="Logins"
        subtitle="Create an ID and password for each person, and switch off people who leave"
        right={
          !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-lg px-4 font-head text-[14px] font-700"
              style={{ minHeight: 44, background: 'var(--accent)', color: '#fff' }}
            >
              + New login
            </button>
          )
        }
      />

      {adding && (
        <NewLogin
          onDone={() => {
            setAdding(false);
            refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="mb-3 mt-2 flex gap-2">
        {(['active', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="rounded-md border px-3 font-head text-[13px] font-700"
            style={{
              minHeight: 40,
              borderColor: filter === f ? 'var(--accent)' : 'var(--line-2)',
              background: filter === f ? 'var(--accent-soft)' : 'transparent',
              color: filter === f ? 'var(--accent-ink)' : 'var(--ink-2)',
            }}
          >
            {f === 'active' ? 'Active' : 'Everyone'}
          </button>
        ))}
      </div>

      {list.isLoading && <Skeleton label="Loading logins" lines={4} />}
      {list.error && <EmptyState title="Logins could not be loaded" detail={errText(list.error)} />}
      <div className="grid gap-2">
        {rows.map((r) => (
          <LoginRow key={r.user_id} r={r} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

function NewLogin({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('supervisor');
  const [shift, setShift] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.rpc('admin_create_user', {
        p_email: email,
        p_password: password,
        p_display_name: name,
        p_role: role,
        p_shift: shift || null,
      });
      if (e) throw e;
    },
    onSuccess: onDone,
    onError: (e) => setError(errText(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="mb-6 rounded-2xl border bg-surface p-5" style={{ borderColor: 'var(--accent)' }}>
      <h2 className="mb-4 font-head text-[18px] font-800">New login</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-[13px] text-ink2" htmlFor="nl-name">
          Name
          <input id="nl-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={inputStyle} placeholder="e.g. Ramarao" required />
        </label>
        <label className="grid gap-1 text-[13px] text-ink2" htmlFor="nl-email">
          Login ID (email)
          <input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} style={inputStyle} placeholder="name@freshbowl.in" autoComplete="off" required />
        </label>
        <label className="grid gap-1 text-[13px] text-ink2" htmlFor="nl-password">
          Password (at least 8 characters)
          <input id="nl-password" type="text" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} mono`} style={inputStyle} autoComplete="new-password" minLength={8} required />
        </label>
        <label className="grid gap-1 text-[13px] text-ink2" htmlFor="nl-shift">
          Shift (optional)
          <input id="nl-shift" value={shift} onChange={(e) => setShift(e.target.value)} className={inputCls} style={inputStyle} placeholder="e.g. A / Day / Night" />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] text-ink2">Role</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={role === r.value}
              onClick={() => setRole(r.value)}
              className="rounded-xl border px-3 py-2 text-left"
              style={{
                borderColor: role === r.value ? 'var(--accent)' : 'var(--line-2)',
                background: role === r.value ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <span className="block font-head text-[14px] font-700">{r.label}</span>
              <span className="block text-[12px] text-muted">{r.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="mt-4 rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: 'var(--crit)', background: 'var(--crit-soft)', color: 'var(--crit)' }}>
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={create.isPending} className="rounded-lg px-5 font-head text-[14px] font-700" style={{ minHeight: 48, background: 'var(--accent)', color: '#fff', opacity: create.isPending ? 0.6 : 1 }}>
          {create.isPending ? 'Creating…' : 'Create login'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-5 font-head text-[14px] font-700" style={{ minHeight: 48, borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
          Cancel
        </button>
      </div>
      <p className="mt-3 text-[12px] text-muted">Give the person their login ID and password directly. They sign in on the phone app (Supervisor, Lab, GM) or the web (Admin, Manager).</p>
    </form>
  );
}

function LoginRow({ r, onChanged }: { r: Login; onChanged: () => void }) {
  const { session } = useAuth();
  const self = session?.user.id === r.user_id;
  const [open, setOpen] = useState<null | 'password' | 'role'>(null);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(r.role === 'operator' ? 'supervisor' : r.role);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = useMutation({
    mutationFn: async (kind: 'password' | 'role' | 'active') => {
      const call =
        kind === 'password'
          ? supabase.rpc('admin_set_password', { p_user: r.user_id, p_password: password })
          : kind === 'role'
            ? supabase.rpc('admin_set_user_role', { p_user: r.user_id, p_role: role })
            : supabase.rpc('admin_set_user_active', { p_user: r.user_id, p_active: !r.is_active });
      const { error } = await call;
      if (error) throw error;
      return kind;
    },
    onSuccess: (kind) => {
      setMsg({ ok: true, text: kind === 'password' ? 'Password changed.' : kind === 'role' ? 'Role changed.' : r.is_active ? 'Login switched off.' : 'Login switched on.' });
      setOpen(null);
      setPassword('');
      onChanged();
    },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });

  return (
    <article className="rounded-xl border bg-surface px-4 py-3" style={{ borderColor: 'var(--line)', opacity: r.is_active ? 1 : 0.7 }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-head text-[16px] font-700 leading-tight">
            {r.display_name} {self && <span className="text-[12px] font-600 text-muted">(you)</span>}
          </p>
          <p className="mono truncate text-[12px] text-muted">{r.email ?? 'no login'}</p>
        </div>
        <Chip tone={r.is_active ? 'accent' : 'muted'}>{roleLabel(r.role)}</Chip>
        {!r.is_active && <Chip tone="warn">Switched off</Chip>}
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {r.shift ? `Shift ${r.shift} · ` : ''}
        {r.last_sign_in_at ? `Last signed in ${new Date(r.last_sign_in_at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Never signed in'}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <SmallButton onClick={() => setOpen(open === 'password' ? null : 'password')}>Set password</SmallButton>
        {!self && <SmallButton onClick={() => setOpen(open === 'role' ? null : 'role')}>Change role</SmallButton>}
        {!self && (
          <SmallButton tone={r.is_active ? 'crit' : 'accent'} onClick={() => run.mutate('active')} disabled={run.isPending}>
            {r.is_active ? 'Switch off' : 'Switch on'}
          </SmallButton>
        )}
      </div>

      {open === 'password' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`pw-${r.user_id}`}>New password</label>
          <input id={`pw-${r.user_id}`} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className={`${inputCls} mono max-w-xs`} style={inputStyle} />
          <SmallButton tone="accent" onClick={() => run.mutate('password')} disabled={run.isPending || password.length < 8}>Save password</SmallButton>
        </div>
      )}
      {open === 'role' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ROLES.map((x) => (
            <SmallButton key={x.value} tone={role === x.value ? 'accent' : undefined} onClick={() => setRole(x.value)}>{x.label}</SmallButton>
          ))}
          <SmallButton tone="accent" onClick={() => run.mutate('role')} disabled={run.isPending}>Save role</SmallButton>
        </div>
      )}
      {msg && <p className="mt-2 text-[13px]" style={{ color: msg.ok ? 'var(--ok)' : 'var(--crit)' }}>{msg.text}</p>}
    </article>
  );
}

function SmallButton({ children, onClick, tone, disabled }: { children: React.ReactNode; onClick: () => void; tone?: 'accent' | 'crit'; disabled?: boolean }) {
  const color = tone === 'crit' ? 'var(--crit)' : tone === 'accent' ? 'var(--accent-ink)' : 'var(--ink-2)';
  const border = tone === 'crit' ? 'var(--crit)' : tone === 'accent' ? 'var(--accent)' : 'var(--line-2)';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-lg border px-3 font-head text-[13px] font-700 disabled:opacity-50" style={{ minHeight: 40, borderColor: border, color, background: tone === 'accent' ? 'var(--accent-soft)' : 'transparent' }}>
      {children}
    </button>
  );
}

export default AdminLogins;
