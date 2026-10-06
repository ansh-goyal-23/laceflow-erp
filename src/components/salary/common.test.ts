import { describe, it, expect } from 'vitest';
import { advanceBalanceFor, advanceBalanceNow } from '@/components/salary/common';

const adv = (id: number, employee_id: string, amount: number, given_on: string): any => ({ id, employee_id, month: given_on.slice(0, 7), amount, given_on, note: null, created_by: null });

describe('advance balance carry-over', () => {
  const advances = [adv(1, 'e1', 5000, '2026-08-10'), adv(2, 'e1', 3000, '2026-09-05'), adv(3, 'e2', 1000, '2026-08-01')];
  const rec = [{ employee_id: 'e1', month: '2026-08', amount: 2000 }];

  it('August balance counts advances given up to the end of August only', () => {
    expect(advanceBalanceFor('e1', '2026-08', advances, rec)).toBe(5000);
  });
  it('September balance carries over what August did not recover and adds new advances', () => {
    expect(advanceBalanceFor('e1', '2026-09', advances, rec)).toBe(6000);
  });
  it('does not mix employees and totals the all-time balance', () => {
    expect(advanceBalanceFor('e2', '2026-09', advances, rec)).toBe(1000);
    expect(advanceBalanceNow('e1', advances, rec)).toEqual({ given: 8000, recovered: 2000, balance: 6000 });
  });
});
