import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../shared/api/client', () => ({ supabase: { rpc: vi.fn() } }));
let role = 'admin';
vi.mock('../../../shared/auth/auth', () => ({ useAuth: () => ({ role }) }));
const useStateReal = vi.hoisted(() => ({ open: false }));
vi.mock('react', async (orig) => {
  const React = await orig<typeof import('react')>();
  // open the dialog on first render so its contents can be asserted statically
  return { ...React, useState: <T,>(init: T) => React.useState(init === false && useStateReal.open ? (true as T) : init) };
});

import type { BatchRow } from '../../../shared/api/batch';
import { ClearBatchesPanel } from './ClearBatchesPanel';

const row = (code: string, status: BatchRow['status'], is_demo: boolean): BatchRow => ({
  id: code, code, label: code, start_date: '2026-09-16', start_at: null, status, supervisor_name: null, activated_at: null, is_demo,
});
const BATCHES = [
  row('158.1,159.1,160.1', 'active', false),
  row('1', 'draft', true),
  row('878,879,880', 'cancelled', true),
  row('158,159,160', 'cancelled', false),
];
const render = () => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}><ClearBatchesPanel batches={BATCHES} /></QueryClientProvider>
);

describe('Clear batches panel', () => {
  it('is Admin-only', () => {
    role = 'supervisor';
    useStateReal.open = false;
    expect(render()).toBe('');
    role = 'admin';
    expect(render()).toContain('Clear batches…');
  });

  it('pre-ticks demo batches only, deletes demo only, and needs the typed word', () => {
    role = 'admin';
    useStateReal.open = true;
    const html = render();
    useStateReal.open = false;
    // the real open batch is listed, marked REAL and not ticked; the demo draft is ticked
    const realRow = html.slice(html.indexOf('158.1,159.1,160.1') - 200, html.indexOf('158.1,159.1,160.1'));
    expect(realRow).not.toContain('checked');
    expect(html).toContain('REAL');
    const demoRow = html.slice(html.indexOf('>1<') - 200, html.indexOf('>1<'));
    expect(demoRow).toContain('checked');
    // cancelled demo + the demo draft being cancelled = 2 deletions; the real cancelled one is never deleted
    expect(html).toContain('Permanently delete 2 demo / test batch(es)');
    expect(html).toContain('1 real cancelled batch(es) stay on record');
    expect(html).toContain('to cancel 1 and delete 2');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Clear 3 batch action\(s\)/);
  });
});
