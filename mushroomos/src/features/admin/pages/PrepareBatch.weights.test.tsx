import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls: { fn: string; args: Record<string, unknown> }[] = [];
vi.mock('../../../shared/api/client', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'cp1', code: 'RAW_MATERIAL_WEIGHMENT', name: 'x' }], error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      from: () => chain(),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: fn === 'open_prebatch_sample' ? 'sample1' : `test-${String(args.p_parameter ?? '')}`, error: null };
      }),
    },
  };
});

import { recordInitialMaterialForBatch, weightReadingsFromInputs } from '../api/prebatch';
import { MaterialCheck } from './PrepareBatch';

const render = () => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><MaterialCheck batchId="b" row={null} loading={false} onDone={() => {}} /></MemoryRouter>
  </QueryClientProvider>
);

describe('Batch Creation · Pre-H0 material weights', () => {
  beforeEach(() => { calls.length = 0; });

  it('shows a Weights section above the save button, with dry and fresh kg for the ten materials', () => {
    const html = render();
    const weights = html.indexOf('>Weights<');
    expect(weights).toBeGreaterThan(-1);
    expect(weights).toBeLessThan(html.indexOf('Save Pre-H0 Material Entry'));
    // the existing fields are still there, before the new section
    for (const f of ['pb-moisture_pct', 'pb-ph', 'pb-dry_weight']) expect(html.indexOf(f)).toBeLessThan(weights);
    for (const m of ['Urea', 'Ash', 'Nitrogen', 'Gypsum', 'Bagasse', 'Paddy', 'Chicken Manure', 'Wheat', 'Mustard', 'Ammonium Sulphate']) {
      expect(html).toContain(`aria-label="${m} dry weight (kg)"`);
      expect(html).toContain(`aria-label="${m} fresh weight (kg)"`);
    }
    expect(html.match(/pb-wt_/g)).toHaveLength(20);
    expect(html).toContain('Dry weight (kg)');
    expect(html).toContain('Fresh weight (kg)');
  });

  it('weights: blanks are skipped, numbers kept, negatives and text refused', () => {
    expect(weightReadingsFromInputs({ wt_urea_dry_kg: '12,5', wt_urea_fresh_kg: '', wt_paddy_fresh_kg: '0' }))
      .toEqual([{ parameter: 'wt_urea_dry_kg', value: 12.5 }, { parameter: 'wt_paddy_fresh_kg', value: 0 }]);
    expect(() => weightReadingsFromInputs({ wt_ash_dry_kg: '-1' })).toThrow('Ash dry weight');
    expect(() => weightReadingsFromInputs({ wt_gypsum_fresh_kg: 'abc' })).toThrow('Gypsum fresh weight');
  });

  it('one save: moisture/pH and the weights go on the same pre-H0 sample', async () => {
    await recordInitialMaterialForBatch('b', 'Initial material data', { moisture_pct: '70', ph: '' }, { wt_bagasse_dry_kg: '5000', wt_bagasse_fresh_kg: '9000' });
    expect(calls.filter((c) => c.fn === 'open_prebatch_sample')).toHaveLength(1);
    expect(calls.filter((c) => c.fn === 'request_lab_test').map((c) => c.args.p_parameter))
      .toEqual(['moisture_pct', 'wt_bagasse_dry_kg', 'wt_bagasse_fresh_kg']);
    expect(calls.filter((c) => c.fn === 'request_lab_test').every((c) => c.args.p_sample === 'sample1')).toBe(true);
    expect(calls.filter((c) => c.fn === 'record_lab_result').map((c) => c.args.p_numeric)).toEqual([70, 5000, 9000]);
  });

  it('callers without weights (onboarding) behave exactly as before', async () => {
    await expect(recordInitialMaterialForBatch('b', 'x', {})).rejects.toThrow('Enter at least one initial material value.');
    await expect(recordInitialMaterialForBatch('b', 'x', {}, {})).rejects.toThrow('Enter at least one initial material value.');
    expect(calls).toHaveLength(0);
    await recordInitialMaterialForBatch('b', 'x', { ph: '7.1' });
    expect(calls.map((c) => c.fn)).toEqual(['open_prebatch_sample', 'request_lab_test', 'record_lab_result']);
  });
});
