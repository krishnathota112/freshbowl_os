import { describe, expect, it } from 'vitest';
import { showQty, shownQty } from './units';

describe('weights are shown in tons, stored in kg', () => {
  it('shows a kg reading in tons', () => {
    expect(showQty(18000, 'kg')).toBe('18 t');
    expect(showQty('14400', 'kg')).toBe('14.4 t');
    expect(showQty(170, 'kg')).toBe('0.17 t');
    expect(shownQty(200, 'KG')).toEqual({ value: '0.2', unit: 't' });
  });
  it('leaves every other unit alone', () => {
    expect(showQty(58.6, '%')).toBe('58.6 %');
    expect(showQty(4, '')).toBe('4');
    expect(showQty(null, 'kg')).toBe('—');
    expect(showQty('n/a', 'kg')).toBe('n/a kg');
  });
});
