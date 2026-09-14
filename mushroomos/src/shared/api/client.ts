import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env.local. ' +
      'Copy .env.example and fill it in.'
  );
}

/**
 * The only Supabase client. Carries the publishable key — the browser never sees a
 * service-role key. docs/ARCHITECTURE_V2.md §12.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
