import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../api/client';
import type { AppRole } from '../domain/types';

/**
 * Authorisation reads the role from the SIGNED TOKEN.
 *
 * The legacy app fetched the role over REST and cached it in localStorage, and its own
 * comments admitted the check was "NOT a security boundary" (S8d). The replacement is
 * public.custom_access_token_hook, which puts app_metadata.app_role inside the JWT the
 * database verifies.
 *
 * FALLBACK, and what it does and does not mean.
 * On a hosted project the hook must be switched on in the dashboard
 * (Authentication > Hooks); config.toml only applies to a local stack. Until it is on, the
 * token carries no role claim, so this module falls back to reading profiles.role for
 * ROUTING ONLY, and reports roleSource: 'profile' so the UI can say so plainly.
 *
 * That fallback decides which screen you land on. It decides nothing about what you can
 * read or write: RLS calls current_app_role(), which reads the claim and nothing else. With
 * the hook off, has_role() is null for everyone, so admin-only writes are refused for
 * everyone — which is the safe direction to fail.
 */

export const ROLE_HOME: Record<AppRole, string> = {
  operator: '/operator/my-work',
  lab_tech: '/lab/queue',
  supervisor: '/supervisor/control-room',
  admin: '/admin/today',
  manager: '/manager/resources',
  gm: '/gm/command-center',
};

export const ROLE_LABEL: Record<AppRole, string> = {
  operator: 'Field Operator',
  lab_tech: 'Lab Technician',
  supervisor: 'Supervisor',
  admin: 'Admin',
  manager: 'Manager',
  gm: 'General Manager',
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** The authoritative read: app_metadata.app_role out of the access token. */
export function roleFromSession(session: Session | null): AppRole | null {
  if (!session?.access_token) return null;
  const payload = decodeJwtPayload(session.access_token);
  const appMeta = payload?.app_metadata as { app_role?: string } | undefined;
  return (appMeta?.app_role as AppRole) ?? null;
}

export type AuthState = {
  session: Session | null;
  role: AppRole | null;
  displayName: string | null;
  loading: boolean;
  /** 'claim' once the access-token hook is enabled; 'profile' while it is not. */
  roleSource: 'claim' | 'profile' | null;
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ role: AppRole; display_name: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const claimRole = roleFromSession(session);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from('profiles')
      .select('role, display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) =>
        setProfile(data ? { role: data.role as AppRole, display_name: data.display_name } : null)
      );
  }, [session]);

  const role = claimRole ?? profile?.role ?? null;

  return {
    session,
    role,
    displayName: profile?.display_name ?? session?.user.email ?? null,
    loading,
    roleSource: session ? (claimRole ? 'claim' : 'profile') : null,
  };
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  await supabase.auth.signOut();
}
