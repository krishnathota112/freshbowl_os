import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../shared/api/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), storage: { from: vi.fn() } } }));
vi.mock('../../../shared/auth/auth', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }));

import type { CleaningJob } from '../../../shared/api/resources';
import { CleaningCard } from './CleaningJobs';

const job = (over: Partial<CleaningJob> = {}): CleaningJob => ({
  id: 't1', state: 'PENDING', location_label: 'Bunker 3', location_kind: 'BUNKER', batch_code: 'DEMO-SOP-1',
  note: 'Batch DEMO-SOP-1: clean before "Extra hopper pass"', requested_at: '2026-09-24T12:59:00Z', started_at: null,
  assigned_to: null, assigned_name: null, photo_count: 0,
  checklist: [{ key: 'prep', label: 'Bunker preparation', done: false }, { key: 'clean', label: 'Bunker cleaning', done: false }],
  ...over,
});
const render = (j: CleaningJob, mine = false) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><CleaningCard job={j} mine={mine} /></QueryClientProvider>
);

describe('Supervisor cleaning job', () => {
  it('a requested job shows where, for which batch, and a Start button', () => {
    const html = render(job());
    expect(html).toContain('Clean Bunker 3');
    expect(html).toContain('For batch DEMO-SOP-1');
    expect(html).toContain('anyone');
    expect(html).toContain('Start cleaning');
    expect(html).not.toContain('Cleaning done');
  });

  it('a started job shows the checklist and photo; Done stays shut until every item is ticked and a photo is taken', () => {
    const html = render(job({ state: 'IN_PROGRESS', started_at: '2026-09-24T13:00:00Z' }));
    expect(html).toContain('Bunker preparation');
    expect(html).toContain('Take photo');
    expect(html).toContain('at least one is needed');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Cleaning done/);
  });

  it('with every item ticked and a photo, Done is open', () => {
    const html = render(job({
      state: 'IN_PROGRESS', photo_count: 1,
      checklist: [{ key: 'prep', label: 'Bunker preparation', done: true }, { key: 'clean', label: 'Bunker cleaning', done: true }],
    }));
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Cleaning done/);
  });

  it('names who it is assigned to', () => {
    expect(render(job({ assigned_to: 'me', assigned_name: 'Ravi' }), true)).toContain('assigned to you');
    expect(render(job({ assigned_to: 'x', assigned_name: 'Ravi' }))).toContain('assigned to Ravi');
  });
});
