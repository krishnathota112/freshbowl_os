// The suites write data; only a local stack is safe unless someone opts in explicitly.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal']);

export function assertLocalTarget(url: string | null, label: string): string | null {
  if (!url) return url;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${label} is not a valid URL, refusing to run database suites`);
  }
  if (LOCAL_HOSTS.has(host) || process.env.ALLOW_REMOTE_DB_TESTS === '1') return url;
  throw new Error(
    `${label} points at ${host}, not a local database. The suites write data. ` +
      'Start the local stack (npx supabase start) and run `npm run test:local`, ' +
      'or set ALLOW_REMOTE_DB_TESTS=1 if you really mean a remote target.'
  );
}
