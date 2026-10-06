import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

const RULES: string[] = [
  'Hours come from the thumb-print machine: the first punch of the day is In and the last punch is Out. Punches before 06:00 are machine errors and are ignored.',
  'The shift starts at 09:00. Coming earlier earns nothing extra. A late arrival must also leave late: the required Out time is the later of In time and 09:00, plus the shift length.',
  'Overtime is paid only when Out is more than 20 minutes after the required Out time, and then it is the exact extra time (no rounding).',
  'Otherwise the worked time (minus lunch where it applies) is rounded to the nearest 30 minutes and capped at the working hours. If it is less than the working hours, the day is Absent, and the hours actually worked are paid as overtime.',
  'For 8-hour workers the 30-minute lunch is extra and unpaid. For 10 and 12-hour workers lunch is inside the working hours and is deducted only if they leave before 18:30.',
  'All Sundays and the listed holidays are paid and count as present. If someone works on a holiday, the whole time between In and Out is paid as overtime.',
  'A day with only one punch is Absent until the missing time is corrected. Every correction needs a reason and is kept in the audit log.',
  'Salary = monthly salary / (calendar days in the month x working hours) x paid hours. Paid hours = regular + holiday + overtime, with no overtime premium.',
  'Net payable = salary minus the advance recovered that month. Any advance not recovered stays on the balance and carries over to the next month.',
];

const RulesHelp: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-card">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium" onClick={() => setOpen(o => !o)}>
        <HelpCircle className="h-4 w-4" />How salary is calculated
        <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 px-9 pb-4 text-sm text-muted-foreground">
          {RULES.map(r => <li key={r}>{r}</li>)}
        </ol>
      )}
    </div>
  );
};

export default RulesHelp;
