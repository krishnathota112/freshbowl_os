/**
 * C9 — S11, the Supervisor Control Room. `UI_IMPLEMENTATION_PLAN §S11`,
 * `ROLE_AND_APPROVAL_MODEL §3.3`.
 *
 * THE GATE: acceptance 60–63.
 *
 * As in C2 and C3 there is no DOM environment, so claims about STRUCTURE — what order the bands
 * appear in, whether a count can be rendered, whether one failure blanks the room — are asserted
 * against the route's source and against the pure data it receives. Claims about APPEARANCE still
 * need the five-minute pass, and the report says which.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DB_URL, NO_DB_REASON, REPO_ROOT, all, one, withRollback } from './db';

const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.warn(`\n  SKIPPED: ${NO_DB_REASON}\n`);

const SRC = join(REPO_ROOT, 'mushroomos', 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const room = () => read('routes', 'ControlRoom.tsx');
const api = () => read('api', 'controlRoom.ts');
const prims = () => read('components', 'primitives', 'index.tsx');

/** Source with commentary stripped — the file's own prose quotes the rules it must not break. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ─────────────────────────────────────────────────────────────────────────────────────────

describe('60 — ordered by urgency, not by batch', () => {
  it('the six bands appear in §3.3 order, and the batch board is LAST', () => {
    const src = codeOf(room());
    const at = (title: string) => src.indexOf(`title="${title}"`);

    const order = [
      'Time-critical gates',
      'Lab failures',
      'Open deviations',
      'Awaiting release',
      'Evidence review',
      'Active batches',
    ].map((t) => ({ t, i: at(t) }));

    for (const o of order) expect(o.i, `band "${o.t}" is missing`).toBeGreaterThan(-1);

    const positions = order.map((o) => o.i);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // The point of the whole screen: a supervisor opens it to find what is stuck, not to browse.
    expect(at('Active batches')).toBe(Math.max(...positions));
  });

  it('the board is the only band that starts collapsed', () => {
    const src = codeOf(room());
    expect(src.match(/defaultOpen=\{false\}/g) ?? []).toHaveLength(1);
    const collapsedAt = src.indexOf('defaultOpen={false}');
    expect(collapsedAt).toBeGreaterThan(src.indexOf('title="Awaiting release"'));
  });
});

describe('61 — every verdict acts in place, with a mandatory reason', () => {
  it('no verdict navigates away', () => {
    const src = codeOf(room());
    // Links to a batch are fine — they are context, not the decision. What must not exist is a
    // route change as the way to reach a verdict.
    expect(src).not.toMatch(/useNavigate|navigate\(/);
    for (const rpc of ['releaseActivity', 'holdActivity', 'returnActivity', 'acceptWithDeviation'])
      expect(src, `${rpc} is not wired`).toContain(rpc);
  });

  it('an action is disabled until a reason is typed', () => {
    const src = codeOf(room());
    expect(src).toMatch(/const ready = reason\.trim\(\)\.length > 0/);
    expect(src).toMatch(/disabled=\{!ready \|\| busy\}/);
  });

  it('the client does not re-implement the reason rule', () => {
    // The server refuses an empty reason and its message is what the user sees. Two places
    // deciding what counts as a reason is how they drift apart — so the wrappers pass it through.
    const src = codeOf(api());
    expect(src).not.toMatch(/throw new Error\([^)]*reason/i);
    expect(src).toMatch(/p_reason: reason/);
  });
});

describe('62 — a band with no backend never shows a zero', () => {
  it('the unbuilt branch carries no count, so a zero cannot be rendered', () => {
    // Enforced by the TYPE, not by review: `Band<T>` is a union and only the built branch has
    // `rows`. This asserts the shape stays that way.
    const contracts = codeOf(read('domain', 'contracts.ts'));
    expect(contracts).toMatch(
      /export type Band<T> =\s*\{ built: true; rows: T\[\] \}\s*\|\s*\{ built: false; releasedWith: string; why: string \}/
    );
  });

  it('Band renders a "not built" chip instead of a count when none is given', () => {
    const src = codeOf(prims());
    expect(src).toMatch(/count === undefined \? \(\s*<Chip tone="lock">not built<\/Chip>/);
  });

  /**
   * REWRITTEN BY B5, NOT DELETED. This asserted `releasedWith: 'B5'` on the lab band — C9's honest
   * record that the band had no backend and named the step that would give it one. B5 gave it one,
   * so the assertion that recorded the old world became red.
   *
   * Criterion 62 forbids a zero for an UNBACKED band. Once the band is backed, a zero is a fact and
   * the note claiming otherwise would be the same lie pointing the other way — so what is asserted
   * now is that the lab band is genuinely wired and the evidence band is still honestly not.
   */
  it('the still-unbacked band says which step releases it, and the backed one is wired', () => {
    const src = api();

    // Evidence review is NOT released by A4 — A4 landed and the band is still unbacked, because
    // nothing anywhere defines who flags a photo for review.
    expect(src).toMatch(/releasedWith: 'a flagging mechanism that does not exist'/);
    expect(src).toMatch(/there is no reviewed or flagged column/);

    // The lab band reads real rows now. No `built: false` for it, and no B5 promissory note.
    expect(src, 'B5 landed, so nothing may still be released-with-B5').not.toMatch(
      /releasedWith: 'B5'/
    );
    expect(src).toMatch(/from\('v_lab_result_current'\)/);

    // ⚠ AND IT SELECTS ONLY REAL FAILURES. `no_spec` in this band would render "the factory has
    // not stated a limit" as "something is wrong" — TBD-13 and LAB_MODEL §9 both forbid it.
    expect(src).toMatch(/\.eq\('verdict', 'fail'\)/);
    expect(src, 'no_spec must never reach the failures band').not.toMatch(
      /\.in\('verdict',[^)]*no_spec/
    );
  });
});

describe('63 — one failing band does not blank the room', () => {
  it('the bands are settled independently', () => {
    const src = codeOf(api());
    expect(src).toContain('Promise.allSettled');
    expect(src).not.toMatch(/await Promise\.all\(\[\s*loadTimeCritical/);
    // A rejection becomes an unbuilt-shaped band carrying the message, so the rest still render.
    expect(src).toMatch(/releasedWith: 'error'/);
  });
});

describe('the room disagrees with the server nowhere', () => {
  it('awaiting-release is computed the same way release_activity checks it', () => {
    const src = api();
    // `release_activity` refuses while anything still awaits a verdict. Listing an activity here
    // that the server would refuse is the frontend contradicting the authority.
    expect(src).toMatch(/stillWaiting/);
    expect(src).toMatch(/awaiting_verdict/);
  });

  it('a protected gate offers escalation instead of an accept it would be refused', () => {
    const src = codeOf(room());
    expect(src).toMatch(/v\.isProtected/);
    expect(src).toMatch(/Escalate to GM/);
  });
});

describeDb('the bands read real rows', () => {
  it('v_deviation_open exposes both questions the room asks of it', async () => {
    await withRollback(async (db) => {
      const cols = await all<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'v_deviation_open'
          order by 1`
      );
      const names = cols.map((c) => c.column_name);
      // `awaiting_verdict` is the supervisor's queue. `stands_on_record` includes accepted ones,
      // which is what a GM package must show — §3.1. The room needs both, separately.
      expect(names).toContain('awaiting_verdict');
      expect(names).toContain('stands_on_record');
    });
  }, 30_000);

  it('the room can be read by an authenticated supervisor', async () => {
    await withRollback(async (db) => {
      const granted = await one<{ n: number }>(
        db,
        `select count(*)::int n from information_schema.role_table_grants
          where table_name = 'v_deviation_open' and grantee = 'authenticated'
            and privilege_type = 'SELECT'`
      );
      expect(Number(granted.n)).toBeGreaterThan(0);
    });
  }, 30_000);
});
