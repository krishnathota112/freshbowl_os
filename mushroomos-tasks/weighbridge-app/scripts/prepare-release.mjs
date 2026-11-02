// Weighbridge release files; does NOT deploy. Same download site as Tasks, under /weighbridge/.
// Run after building (android assembleDebug) and checking the APK signature:
//   RELEASE_NOTES="…" node weighbridge-app/scripts/prepare-release.mjs
// Then deploy the whole site: npx wrangler@4 pages deploy release-site --project-name freshbowl-tasks-downloads --branch main
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root = new URL('../../', import.meta.url), ctx = { window: { TK: {} } };
vm.runInNewContext(readFileSync(new URL('weighbridge-app/www/build-info.js', root), 'utf8'), ctx);
const build = ctx.window.TK.build, gradle = readFileSync(new URL('weighbridge-app/android/app/build.gradle', root), 'utf8');
if (!gradle.includes('versionCode ' + build.versionCode) || !gradle.includes('versionName "' + build.version + '"')) throw new Error('build-info.js and build.gradle versions do not match');
const bytes = readFileSync(new URL('weighbridge-app/android/app/build/outputs/apk/debug/app-debug.apk', root)), hash = createHash('sha256').update(bytes).digest('hex');
const dir = new URL('release-site/weighbridge/', root);
mkdirSync(dir, { recursive: true });
const apk = 'MushroomOS-Weighbridge-v' + build.version + '.apk', dest = new URL(apk, dir);
if (existsSync(dest) && createHash('sha256').update(readFileSync(dest)).digest('hex') !== hash && !process.argv.includes('--replace-unpublished'))
  throw new Error('This version already has different bytes. Bump the version for a published release.');
writeFileSync(dest, bytes);
const manifest = { ...build, apk, bytes: bytes.length, sha256: hash, publishedAt: new Date().toISOString(), notes: process.env.RELEASE_NOTES || '' };
writeFileSync(new URL('latest.json', dir), JSON.stringify(manifest, null, 2) + '\n');
copyFileSync(dest, new URL('apk/MushroomOS-Weighbridge-' + new Date().toISOString().slice(0, 10) + '-v' + build.version + '.apk', root));
console.log(JSON.stringify({ version: build.version, versionCode: build.versionCode, bytes: bytes.length, sha256: hash, site: 'release-site/weighbridge' }, null, 2));
