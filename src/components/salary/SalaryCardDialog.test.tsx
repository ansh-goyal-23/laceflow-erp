import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import fixture from '@/test/fixtures/attendance-aug-2026.json';

const mutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useSalary', () => ({
  useSalaryEdits: () => ({ data: [] }),
  useSaveTimeEdit: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import SalaryCardDialog from './SalaryCardDialog';

const employee: any = { id: 'emp-1', machine_no: 13, name: 'Yusuf', department: 'Dept1', is_active: true, monthly_salary: 17000, working_hours: 12, lunch_included: true };
const holidays = { '2026-08-15': 'Independence Day', '2026-08-28': 'Raksha Bandhan' };
const mount = () => render(
  <SalaryCardDialog
    employee={employee} month="2026-08"
    settings={{ monthlySalary: 17000, workingHours: 12, lunchIncluded: true }}
    punchesByDate={(fixture as any).yusuf} overridesByDate={{}} holidays={holidays}
    onClose={() => {}} onMarkPaid={() => {}} onUndoPaid={() => {}}
  />,
);

describe('SalaryCardDialog', () => {
  beforeEach(() => mutateAsync.mockClear());

  it('shows the header totals and one row per day', () => {
    mount();
    expect(screen.getByText('₹14,761')).toBeInTheDocument();
    expect(screen.getByText('95h 0m')).toBeInTheDocument();
    expect(screen.getByText('323.00')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(31 + 1); // 31 days + header
    expect(screen.getAllByText(/H \/ Holiday/).length).toBeGreaterThanOrEqual(7);
  });

  it('editing a time requires a reason and is sent to the log', async () => {
    mount();
    // 1 Aug row: click the Out time (21:15)
    fireEvent.click(screen.getAllByTitle('Click to edit').find(b => b.textContent?.includes('21:15'))!);
    const dialog = await screen.findByText('Edit Out time');
    expect(dialog).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/leave empty to clear/i), { target: { value: '19:00' } });
    fireEvent.click(screen.getByText('Save change'));
    expect(mutateAsync).not.toHaveBeenCalled(); // no reason yet
    fireEvent.change(screen.getByPlaceholderText(/forgot to punch out/i), { target: { value: 'left early, approved' } });
    fireEvent.click(screen.getByText('Save change'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      employeeId: 'emp-1', date: '2026-08-01', field: 'out', oldValue: '21:15', newValue: '19:00', reason: 'left early, approved', reset: false,
    });
  });
});
