/**
 * Where this app talks to. Both values are PUBLISHABLE and belong in the client: the anon key is the
 * key PostgREST expects before it looks at your session, and every row it can reach is decided by
 * Postgres RLS against the signed-in user. A service-role key, a database password or any other
 * secret must NEVER appear in this folder — the APK is a zip file that anyone can open.
 */
window.MOS = window.MOS || {};
window.MOS.config = {
  updateManifest: 'https://freshbowl-tasks-downloads.pages.dev/weighbridge/latest.json',
  url: 'https://szwosmyqwvpaqugjtzcp.supabase.co',
  anon: 'sb_publishable_X2SBh6jqSzDB7-AmvkY2Vg_fw8OSUsL',
};
