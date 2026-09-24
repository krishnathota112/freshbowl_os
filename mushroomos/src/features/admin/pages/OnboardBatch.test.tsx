import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// PROCESS-2026K-shaped rows (codes, units and hours as generated on 16 Sep 2026), trimmed.
const ROWS = [
  ['PRIMARY_FIBRE', null, 'FIB-WET-1', 'Wetting — 1st hopper pass', 0],
  ['PRIMARY_FIBRE', null, 'FIB-REST-1', 'Rest', 3, true],
  ['STRUCTURAL_STRAW', null, 'STR-SOAK-2', 'Soaking 2', 104],
  ['YARD', 'Whole batch', 'MIX-CM-ADD', 'Add CM mix + loader mixing', 136],
  ['YARD', 'Pile 2', 'TRN-P2-T2', 'Turner T2 — pile 2', 188.5],
  ['YARD', 'Pile 1', 'TRN-P1-T0', 'Turner T0 — pile 1', 170],
  ['YARD', 'Pile 10', 'TRN-P10-T0', 'Turner T0 — pile 10', 170],
  ['YARD', 'Pile 1', 'TRN-P1-T3', 'Turner T3 — pile 1', 188.5],
  ['BUNKER', 'Bunker 1', 'BNK-B1-FILL', 'Bunker filling — bunker 1', 190],
  ['BUNKER', 'Bunker 2', 'BNK-B2-FILL', 'Bunker filling — bunker 2', 190],
].map(([stream, scope, code, title, h, hold], i) => ({
  id: `id-${code}`, code, title, stream, scope_label: scope, seq: i, is_hold: Boolean(hold), baseline_start_hour: h, responsible_role: 'supervisor',
}));

vi.mock('../../../shared/api/client', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'order']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: ROWS, error: null }).then(ok);
    return c;
  };
  return { supabase: { from: () => chain(), rpc: vi.fn() } };
});

import { listOnboardingUnits, unitWords, type OnboardUnit } from '../api/onboarding';
import { OnboardBatch, verify } from './OnboardBatch';

describe('running-batch onboarding — per unit', () => {
  it('splits streams into their physical units from the batch plan, in natural order', async () => {
    const streams = await listOnboardingUnits('b');
    expect(streams.map((s) => s.stream)).toEqual(['PRIMARY_FIBRE', 'STRUCTURAL_STRAW', 'YARD', 'BUNKER']);
    const yard = streams.find((s) => s.stream === 'YARD')!;
    expect(yard.units.map((u) => u.label)).toEqual(['Shared steps (whole batch)', 'Pile 1', 'Pile 2', 'Pile 10']);
    expect(yard.units[1].key).toBe('YARD|Pile 1');
    expect(yard.units[1].activities.map((a) => a.code)).toEqual(['TRN-P1-T0', 'TRN-P1-T3']);
    // a one-line stream is named by the stream, keyed as its whole batch
    const fibre = streams[0];
    expect(fibre.units).toHaveLength(1);
    expect(fibre.units[0].key).toBe('PRIMARY_FIBRE|Whole batch');
    expect(fibre.units[0].label).toBe('Main material (bagasse)');
  });

  it('edit screen: one selector per unit, built only from that unit\'s activities', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['batch-context', 'b'], { master_batch_id: 'b', code: '158.1', status: 'draft', process_code: 'PROCESS-2026K' });
    client.setQueryData(['prebatch', 'b'], { results_current: 1 });
    client.setQueryData(['onboard-units', 'b'], await listOnboardingUnits('b'));
    client.setQueryData(['batch-materials', 'b'], []);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/admin/batch/b/onboard']}>
          <Routes><Route path="/admin/batch/:id/onboard" element={<OnboardBatch />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(html).toContain('Onboard running batch · 158.1');
    expect(html).toContain('Where is the batch now?');
    for (const t of ['Main material (bagasse)', 'Paddy straw', 'Yard — mixing &amp; Turner piles', 'Bunkers', 'Pile 1', 'Pile 2', 'Bunker 1']) {
      expect(html).toContain(t);
    }
    expect(html.match(/<select/g)).toHaveLength(8); // fibre, paddy, yard shared, P1, P2, P10, B1, B2
    expect(html).toContain('Soaking 2 · H104');
    expect(html).toContain('Rest (rest / hold)');
    expect(html).toContain('Finished — all 2 step(s) done');
    // Pile 2's selector must not offer Pile 1's turns
    const p2 = html.slice(html.indexOf('>Pile 2<'), html.indexOf('>Pile 10<'));
    expect(p2).toContain('Turner T2 — pile 2');
    expect(p2).not.toContain('pile 1');
    expect(html).toContain('Review what will be saved');
    expect(html).not.toContain('Confirm onboarding'); // nothing can be saved before the review
    client.clear();
  });

  it('server refusals are put into factory words', async () => {
    const streams = await listOnboardingUnits('b');
    expect(unitWords('work in these units is already done: [YARD|Whole batch], [PRIMARY_FIBRE|Whole batch].', streams))
      .toBe('work in these units is already done: Yard — mixing & Turner piles: Shared steps (whole batch), Main material (bagasse).');
  });

  it('after saving, the read-back is checked against the choices and the review', () => {
    const units: OnboardUnit[] = [
      { key: 'YARD|Pile 1', stream: 'YARD', label: 'Pile 1', activities: [{ id: 'p1t3', code: 'TRN-P1-T3', title: '', seq: 1, isHold: false, startHour: 188 }] },
      { key: 'YARD|Pile 2', stream: 'YARD', label: 'Pile 2', activities: [{ id: 'p2t2', code: 'TRN-P2-T2', title: '', seq: 2, isHold: false, startHour: 187 }] },
      { key: 'YARD|Pile 3', stream: 'YARD', label: 'Pile 3', activities: [{ id: 'p3t0', code: 'TRN-P3-T0', title: '', seq: 3, isHold: false, startHour: 170 }] },
    ];
    const full = { batchId: 'b', actualH0: '2026-09-08T08:00:00Z', positions: ['p2t2'], finishedUnits: ['YARD|Pile 1'], note: null };
    const act = (id: string, code: string, scope: string, state: string, bt: boolean, extra = {}) => ({
      id, code, stream: 'YARD', scope_label: scope, responsible_role: 'supervisor', state, before_tracking: bt,
      onboarded_position: id === 'p2t2', actual_start: null, actual_end: null, planned_start_at: null, ...extra,
    });
    const good = {
      batch: { status: 'active', start_at: '2026-09-08T08:00:00Z', process_definition_id: 'k' },
      activities: [act('p1t3', 'TRN-P1-T3', 'Pile 1', 'SKIPPED', true), act('p2t2', 'TRN-P2-T2', 'Pile 2', 'READY', false), act('p3t0', 'TRN-P3-T0', 'Pile 3', 'WAITING_CONDITION', false)],
    };
    const preview = good.activities.map((a) => ({ activity_id: a.id, code: a.code, title: '', stream: 'YARD', unit: a.scope_label, is_lab: false, state: a.state, before_tracking: a.before_tracking, is_position: a.onboarded_position, baseline_start_hour: 0, planned_start_at: null }));
    expect(verify(full, preview, 'k', good, units).filter((c) => !c.ok)).toEqual([]);

    const bad = {
      batch: { status: 'active', start_at: '2026-09-08T09:00:00Z', process_definition_id: 'other' },
      activities: [
        act('p1t3', 'TRN-P1-T3', 'Pile 1', 'READY', false),
        act('p2t2', 'TRN-P2-T2', 'Pile 2', 'READY', false, { actual_start: '2026-09-16T00:00:00Z' }),
        act('p3t0', 'TRN-P3-T0', 'Pile 3', 'SKIPPED', true, { planned_start_at: '2026-09-16T00:00:00Z' }),
      ],
    };
    const failed = verify(full, preview, 'k', bad, units).filter((c) => !c.ok).map((c) => c.label);
    expect(failed).toEqual(expect.arrayContaining([
      'Actual start (H0) saved as given',
      'Process version unchanged',
      'Finished units recorded as done before tracking',
      '“Not started” units have no assumed history',
      'No start or finish times invented',
      'Work before tracking has no planned time',
      'Saved result matches the review',
    ]));
  });
});
