import * as XLSX from 'xlsx';
import { fmtHM, fmtHMZero, type MonthSummary, type SalarySettings } from '@/lib/salaryCalc';

interface CardInfo {
  employeeName: string;
  machineNo: number;
  monthLabel: string;
  settings: SalarySettings;
  summary: MonthSummary;
  advanceRecovered: number;
}

const hoursStr = (min: number) => String(Math.round((min / 60) * 100) / 100);
const money = (v: number) => Math.round(v).toLocaleString('en-IN');

const dayRow = (d: MonthSummary['days'][number]) => {
  const noTimes = !d.inTime && !d.outTime;
  const label = d.status === 'Holiday' ? 'H / Holiday' : d.status === 'Absent' ? 'A / Absent' : hoursStr(d.regularMin);
  return [
    `${d.date.slice(8)}/${d.date.slice(5, 7)}`, d.dow,
    noTimes ? '' : d.inTime || '', noTimes ? '' : d.outTime || '',
    label, fmtHM(d.otMin),
  ];
};

const fileBase = (c: CardInfo) => `Salary_${c.employeeName.replace(/\s+/g, '_')}_${c.summary.month}`;

export async function downloadSalaryCardPdf(c: CardInfo) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const s = c.summary;
  const net = s.salary - c.advanceRecovered;

  doc.setFontSize(15);
  doc.text(`Attendance / Salary Card: ${c.employeeName}`, 40, 42);
  doc.setFontSize(10);
  doc.text(`${c.monthLabel}   |   Machine no. ${c.machineNo}`, 40, 58);

  autoTable(doc, {
    startY: 70,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [60, 60, 60] },
    head: [['Date', 'Day', 'In', 'Out', 'Hours Worked', 'Overtime']],
    body: s.days.map(dayRow),
    columnStyles: { 4: { halign: 'center' }, 5: { halign: 'center' } },
  });

  const y = ((doc as any).lastAutoTable?.finalY ?? 600) + 16;
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3 },
    body: [
      ['Monthly salary', `Rs ${money(c.settings.monthlySalary)}`, 'Working hours / day', String(c.settings.workingHours)],
      ['Days present (incl. paid holidays)', String(s.daysPresent), 'Total overtime', fmtHMZero(s.otMin)],
      ['Regular hours worked', hoursStr(s.regularMin), 'Holiday hours (paid)', hoursStr(s.holidayMin)],
      ['Total paid hours', s.paidHours.toFixed(2), 'Salary calculated', `Rs ${money(s.salary)}`],
      ['Advance recovered', `Rs ${money(c.advanceRecovered)}`, 'Net payable', `Rs ${money(net)}`],
    ],
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } },
  });
  doc.setFontSize(8);
  doc.text(
    `Salary = monthly salary / (${s.daysInMonth} days x ${c.settings.workingHours} hrs) x paid hours (hourly rate ${s.hourlyRate.toFixed(2)}).`,
    40, ((doc as any).lastAutoTable?.finalY ?? 780) + 14,
  );
  doc.save(`${fileBase(c)}.pdf`);
}

export function downloadSalaryCardXlsx(c: CardInfo) {
  const s = c.summary;
  const net = s.salary - c.advanceRecovered;
  const rows: (string | number)[][] = [
    [`Attendance / Salary Card: ${c.employeeName}`],
    [c.monthLabel, `Machine no. ${c.machineNo}`],
    [],
    ['Date', 'Day', 'In Time', 'Out Time', 'Hours Worked', 'Overtime'],
    ...s.days.map(d => {
      const r = dayRow(d);
      return [d.date, r[1], r[2], r[3], r[4], r[5]];
    }),
    [],
    ['Monthly salary', c.settings.monthlySalary],
    ['Working hours per day', c.settings.workingHours],
    ['Days present (incl. paid holidays)', s.daysPresent],
    ['Total overtime', fmtHMZero(s.otMin)],
    ['Total paid hours', Number(s.paidHours.toFixed(2))],
    ['Salary calculated', s.salary],
    ['Advance recovered', c.advanceRecovered],
    ['Net payable', net],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Salary card');
  XLSX.writeFile(wb, `${fileBase(c)}.xlsx`);
}
