import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../shared/api/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { BatchStart, clearRepeatedFibres, fibreTakenBefore } from './BatchStart';

// material_role_eligibility as it stands on 16 Sep 2026 (fibre roles + one non-fibre role)
const m = (id: string, name: string) => ({ id, code: id, name, category: 'fibre' });
const ROLES = [
  { role: 'PRIMARY_FIBRE', leadId: 'BAGASSE_NEW', materials: [m('BAGASSE_NEW', 'Bagasse (new)'), m('BAGASSE_OLD', 'Bagasse (old)'), m('MUSTARD_STRAW', 'Mustard Straw'), m('WHEAT_STRAW', 'Wheat Straw')] },
  { role: 'SECONDARY_FIBRE', leadId: null, materials: [m('MUSTARD_STRAW', 'Mustard Straw'), m('WHEAT_STRAW', 'Wheat Straw')] },
  { role: 'TERTIARY_FIBRE', leadId: null, materials: [m('BAGASSE_NEW', 'Bagasse (new)'), m('BAGASSE_OLD', 'Bagasse (old)'), m('MUSTARD_STRAW', 'Mustard Straw'), m('WHEAT_STRAW', 'Wheat Straw')] },
  { role: 'STRUCTURAL_STRAW', leadId: 'PADDY_PUNJAB', materials: [m('PADDY_LOCAL', 'Paddy Straw (local)'), m('PADDY_PUNJAB', 'Paddy Straw (Punjab)')] },
];

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['selectable-processes'], [{ id: 'k', code: 'PROCESS-2026K', version: 1, name: 'Standard', isCurrent: true, standardHr: 476 }]);
  client.setQueryData(['material-roles'], ROLES);
  client.setQueryData(['required-material-roles', 'k'], ['PRIMARY_FIBRE', 'STRUCTURAL_STRAW']);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><MemoryRouter><BatchStart mode="new" /></MemoryRouter></QueryClientProvider>
  );
}
const selectAfter = (html: string, title: string) => {
  const from = html.indexOf(title);
  return html.slice(html.indexOf('<select', from), html.indexOf('</select>', from));
};

describe('batch creation — fibre selectors', () => {
  it('Main shows every fibre material; Second and Third show the same list minus earlier choices, plus Not used', () => {
    const html = render();
    const main = selectAfter(html, 'Main fibre');
    for (const n of ['Bagasse (new)', 'Bagasse (old)', 'Mustard Straw', 'Wheat Straw']) expect(main).toContain(n);
    expect(main).not.toContain('Paddy'); // only fibre materials
    const second = selectAfter(html, 'Second fibre');
    expect(second).toContain('Not used');
    expect(second).not.toContain('Bagasse (new)'); // Main's default choice
    for (const n of ['Bagasse (old)', 'Mustard Straw', 'Wheat Straw']) expect(second).toContain(n);
    // Third fibre: same list, minus Main (Second is "Not used", so nothing more is excluded)
    const third = selectAfter(html, 'Third fibre');
    expect(third).toContain('Not used');
    expect(third).not.toContain('Bagasse (new)');
    for (const n of ['Bagasse (old)', 'Mustard Straw', 'Wheat Straw']) expect(third).toContain(n);
    // the three fibres sit together, in rank order
    expect(html.indexOf('Main fibre')).toBeLessThan(html.indexOf('Second fibre'));
    expect(html.indexOf('Second fibre')).toBeLessThan(html.indexOf('Third fibre'));
    expect(html.indexOf('Third fibre')).toBeLessThan(html.indexOf('>Straw<'));
    // non-fibre roles keep their own list
    expect(selectAfter(html, '>Straw<')).toContain('Paddy Straw (Punjab)');
  });

  it('later fibres exclude every earlier choice; Not used is never a material', () => {
    const roles = ['PRIMARY_FIBRE', 'SECONDARY_FIBRE', 'TERTIARY_FIBRE'];
    const v: Record<string, string> = { PRIMARY_FIBRE: 'A', SECONDARY_FIBRE: 'B', TERTIARY_FIBRE: 'C' };
    expect(fibreTakenBefore(roles, (r) => v[r], 'PRIMARY_FIBRE')).toEqual([]);
    expect(fibreTakenBefore(roles, (r) => v[r], 'SECONDARY_FIBRE')).toEqual(['A']);
    expect(fibreTakenBefore(roles, (r) => v[r], 'TERTIARY_FIBRE')).toEqual(['A', 'B']);
    // '' (Not used) is not a material and is not excluded
    expect(fibreTakenBefore(roles, (r) => ({ ...v, SECONDARY_FIBRE: '' } as Record<string, string>)[r] ?? '', 'TERTIARY_FIBRE')).toEqual(['A']);
  });

  it('changing Main or Second clears a later fibre that would now repeat it', () => {
    const roles = ['PRIMARY_FIBRE', 'SECONDARY_FIBRE', 'TERTIARY_FIBRE'];
    const valueIn = (p: Record<string, string>, r: string) => p[r] ?? '';
    // Main changed to Second's material → Second cleared, Third kept
    expect(clearRepeatedFibres(roles, { PRIMARY_FIBRE: 'B', SECONDARY_FIBRE: 'B', TERTIARY_FIBRE: 'C' }, valueIn))
      .toEqual({ PRIMARY_FIBRE: 'B', SECONDARY_FIBRE: '', TERTIARY_FIBRE: 'C' });
    // Second changed to Third's material → Third cleared
    expect(clearRepeatedFibres(roles, { PRIMARY_FIBRE: 'A', SECONDARY_FIBRE: 'C', TERTIARY_FIBRE: 'C' }, valueIn))
      .toEqual({ PRIMARY_FIBRE: 'A', SECONDARY_FIBRE: 'C', TERTIARY_FIBRE: '' });
    // Not used everywhere stays as it is
    expect(clearRepeatedFibres(roles, { PRIMARY_FIBRE: 'A', SECONDARY_FIBRE: '', TERTIARY_FIBRE: '' }, valueIn))
      .toEqual({ PRIMARY_FIBRE: 'A', SECONDARY_FIBRE: '', TERTIARY_FIBRE: '' });
    // the lead default (not yet in state) counts as Main's choice
    const withLead = (p: Record<string, string>, r: string) => (r in p ? p[r] : r === 'PRIMARY_FIBRE' ? 'A' : '');
    expect(clearRepeatedFibres(roles, { SECONDARY_FIBRE: 'A' }, withLead)).toEqual({ SECONDARY_FIBRE: '' });
  });
});
