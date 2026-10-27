import { describe, it, expect } from 'vitest';
import { matchesColumnFilter } from '@/lib/pricingColumnFilter';

describe('matchesColumnFilter', () => {
  it('text contains, case-insensitive', () => {
    expect(matchesColumnFilter('bpo', 'BPO Top V2')).toBe(true);
    expect(matchesColumnFilter('setup', 'BPO Top V2')).toBe(false);
  });
  it('numeric comparisons', () => {
    expect(matchesColumnFilter('>500', 'R$ 1.499,99', 1499.99)).toBe(true);
    expect(matchesColumnFilter('<500', 'R$ 1.499,99', 1499.99)).toBe(false);
    expect(matchesColumnFilter('=3', '3x', 3)).toBe(true);
    expect(matchesColumnFilter('>=1.000,50', '', 1000.5)).toBe(true);
  });
  it('empty filter matches everything', () => {
    expect(matchesColumnFilter('  ', 'x')).toBe(true);
  });
});
