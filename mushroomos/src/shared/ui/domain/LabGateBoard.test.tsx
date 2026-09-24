import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { gateStatusWords } from '../../utils/labWords';
import { LabGateBoard } from './AdminLive';

const base = {
  batch_code: 'DEMO-1', activity_title: 'Before first bunker loading', checkpoint_code: 'LAB-BNK-PRE',
  gates_activity_code: 'FIB-BUNK-LOAD', gates_activity_title: 'Flipping + bunker filling', is_gate: true,
  result_count: 3, decided_role: 'gm', decided_by_name: 'singh', decided_at: '2026-09-16T10:47:07Z',
};
const rows = [
  { ...base, activity_id: 'a', awaiting_decision: true, is_approved: false, latest_verdict: null, latest_reason: null, gates_activity_state: 'BLOCKED', decided_at: null, decided_by_name: null },
  { ...base, activity_id: 'b', batch_code: 'DEMO-2', awaiting_decision: false, is_approved: true, latest_verdict: 'approved', latest_reason: 'Within spec — go ahead', gates_activity_state: 'READY' },
  { ...base, activity_id: 'c', batch_code: 'DEMO-3', awaiting_decision: false, is_approved: false, latest_verdict: 'rejected', latest_reason: 'Moisture too high', gates_activity_state: 'BLOCKED' },
];

describe('Lab gates on Admin — GM decisions with remarks (0126)', () => {
  it('shows waiting, approved and rejected gates with who, remark and what it means for the Supervisor', () => {
    const html = renderToStaticMarkup(<MemoryRouter><LabGateBoard approvals={rows} loading={false} /></MemoryRouter>);
    expect(html).toContain('WAITING FOR GM');
    expect(html).toContain('Submitted by the Lab — waiting for the GM’s decision');
    expect(html).toContain('APPROVED');
    expect(html).toContain('Approved by singh (GM)');
    expect(html).toContain('“Within spec — go ahead”');
    expect(html).toContain('Flipping + bunker filling is open for the Supervisor (ready)');
    expect(html).toContain('REJECTED');
    expect(html).toContain('Rejected by singh (GM) — back with the Lab to re-test');
    expect(html).toContain('“Moisture too high”');
    expect(html).toContain('stays shut until the Lab re-tests and the GM approves');
  });

  it('a re-submission after a rejection reads as waiting again', () => {
    expect(gateStatusWords({ awaiting_decision: true, latest_verdict: 'rejected', latest_reason: 'x', decided_by_name: 'singh', decided_role: 'gm' }).head)
      .toBe('Re-submitted by the Lab — waiting for the GM’s decision');
    expect(gateStatusWords({ awaiting_decision: false, latest_verdict: null, latest_reason: null, decided_by_name: null, decided_role: null }).head)
      .toBe('Waiting for the Lab to test and submit');
  });
});
