/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // The chunk graph, written out so it can be ASSERTED rather than described.
    //
    // C-FIELD's exit proof is "the field entry's initial bundle excludes the tower/graph/Gantt chunks,
    // asserted against build output". `dist/.vite/manifest.json` maps every source module to the chunk
    // it landed in, and separates `imports` (static — downloaded with the chunk) from `dynamicImports`
    // (lazy — downloaded only when the route is opened). That distinction is the whole proof, and
    // reading it is the only way to check the boundary without guessing from file names.
    //
    // `tests/fieldShell.test.ts` reads it.
    manifest: true,
  },
  test: {
    // The engine proofs in tests/ talk to the deployed Supabase project, so a single assertion can
    // cost a round trip to another region. Vitest's 5 s default fails them on latency rather than
    // on behaviour. The pure tests in src/domain/ finish in milliseconds either way.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // ONE shared deployed database, so test FILES must not run at the same time.
    //
    // Most suites are safe in parallel because they work inside a transaction that is rolled back.
    // A4's cannot: uploading real bytes to real storage and binding them is not transactional, so
    // while `tests/evidence.test.ts` holds live evidence on the demo batches, A3's "no work history
    // was fabricated" assertion sees a satisfied requirement and fails — a race between two correct
    // tests, not a defect in either. Serialising the files makes each one's setup and teardown
    // complete before the next begins.
    fileParallelism: false,
  },
});
