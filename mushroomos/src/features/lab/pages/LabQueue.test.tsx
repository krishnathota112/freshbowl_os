import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabQueue } from './LabQueue';

vi.mock('../../../shared/api/lab', () => ({ loadLabWork: vi.fn() }));

describe('Lab queue after eligibility state changes', () => {
  it('keeps waiting and not-yet-due checkpoints visible without offering Record', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['lab-work'], ['WAITING_CONDITION', 'NOT_DUE_YET', 'BLOCKED'].map((state, i) => ({
      activityId: String(i), activityTitle: `Checkpoint ${i}`, state,
      masterBatchId: 'test', batchCode: 'TEST', scopeLabel: 'Whole batch',
      parameters: [], results: 0, samples: 0, band: 'today', lastSubmission: null,
      plannedStartAt: '2099-01-01T00:00:00Z', actualEnd: null,
      baselineStartHour: i * 10, blockedReason: 'Waiting for the configured condition', holdsGate: false,
    })));
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><LabQueue /></MemoryRouter></QueryClientProvider>);
    for (let i=0;i<3;i++) expect(html).toContain(`Checkpoint ${i}`);
    expect(html).toContain('Not due yet');
    expect(html).toContain('Blocked');
    expect(html).toContain('Planned H');
    expect(html).not.toMatch(/>Record</);
    client.clear();
  });
});
