import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dayLabel } from '@/components/salary/common';
import {
  useCarryHolidaysForward, useDeleteHoliday, useSaveHoliday, useUpdateHoliday, type SalaryHoliday,
} from '@/hooks/useSalary';

const PRESETS = ['Republic Day', 'Holi', 'Independence Day', 'Raksha Bandhan', 'Janmashtami', 'Gandhi Jayanti', 'Dussehra', 'Diwali', 'Govardhan Puja', 'Bhai Dooj'];

const HolidaysTab: React.FC<{ holidays: SalaryHoliday[] }> = ({ holidays }) => {
  const save = useSaveHoliday();
  const update = useUpdateHoliday();
  const del = useDeleteHoliday();
  const carry = useCarryHolidaysForward();

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const set = new Set<number>([thisYear, ...holidays.map(h => Number(h.holiday_date.slice(0, 4)))]);
    return [...set].sort((a, b) => b - a);
  }, [holidays, thisYear]);
  const [year, setYear] = useState(thisYear);
  const [newH, setNewH] = useState({ date: '', name: '' });
  const [edit, setEdit] = useState<{ old: SalaryHoliday; date: string; name: string } | null>(null);

  const list = holidays.filter(h => h.holiday_date.startsWith(`${year}-`));
  const toConfirm = list.filter(h => !h.confirmed).length;
  const nextYearHasRows = holidays.some(h => h.holiday_date.startsWith(`${year + 1}-`));

  const add = async () => {
    if (!newH.date || !newH.name.trim()) { toast.error('Enter a date and a name.'); return; }
    try { await save.mutateAsync({ holiday_date: newH.date, name: newH.name.trim() }); setNewH({ date: '', name: '' }); setYear(Number(newH.date.slice(0, 4))); }
    catch (err: any) { toast.error(err?.message || 'Could not save.'); }
  };

  const startNewYear = async () => {
    if (!window.confirm(`Copy the ${year} holiday names into ${year + 1} as "date to confirm"? The ${year} list stays on record.`)) return;
    try {
      const n = await carry.mutateAsync(year);
      toast.success(n ? `${n} holiday(s) copied into ${year + 1}. Confirm each date.` : `Nothing to copy from ${year}.`);
      if (n) setYear(year + 1);
    } catch (err: any) { toast.error(err?.message || 'Could not copy.'); }
  };

  const saveEdit = async () => {
    if (!edit) return;
    if (!edit.date || !edit.name.trim()) { toast.error('Enter a date and a name.'); return; }
    try { await update.mutateAsync({ oldDate: edit.old.holiday_date, newDate: edit.date, name: edit.name.trim() }); setEdit(null); }
    catch (err: any) { toast.error(err?.message || 'Could not save (is there already a holiday on that date?).'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All Sundays are paid holidays automatically. Other holidays are saved here for good and used in every month's calculation. Festival dates
        change each year, so edit the date when it is known. At the start of a year use "Start new year" to copy the names forward; copied
        holidays do not count until you confirm their date. A day when workers are asked not to come is not a holiday: it is simply Absent.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Year</Label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[...new Set([...years, year])].sort((a, b) => b - a).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <Button variant="outline" onClick={startNewYear} disabled={carry.isPending || list.filter(h => h.confirmed).length === 0}>
          <CalendarPlus className="h-4 w-4 mr-1" />Start new year ({year + 1}) from {year}
        </Button>
        {nextYearHasRows && <span className="text-xs text-muted-foreground">{year + 1} already has entries; only missing dates are added.</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input type="date" value={newH.date} onChange={e => setNewH({ ...newH, date: e.target.value })} className="w-44" />
        <Input list="holiday-presets" placeholder="Name (e.g. Holi)" value={newH.name} onChange={e => setNewH({ ...newH, name: e.target.value })} className="w-64" />
        <datalist id="holiday-presets">{PRESETS.map(p => <option key={p} value={p} />)}</datalist>
        <Button onClick={add} disabled={save.isPending}>Add holiday</Button>
      </div>

      {toConfirm > 0 && <p className="text-sm text-amber-600">{toConfirm} holiday date(s) in {year} still need to be confirmed. They are not counted in salary until you do.</p>}

      <div className="rounded-lg border bg-card divide-y">
        {list.length === 0 && <div className="p-4 text-sm text-muted-foreground">No holidays saved for {year}.</div>}
        {list.map(h => (
          <div key={h.holiday_date} className="flex items-center justify-between gap-2 p-3 text-sm">
            <span>
              {dayLabel(h.holiday_date)}: <b>{h.name}</b>
              {!h.confirmed && <Badge variant="outline" className="ml-2 text-amber-600 border-amber-400">Date to confirm</Badge>}
            </span>
            <span className="flex gap-1">
              <Button variant={h.confirmed ? 'ghost' : 'outline'} size={h.confirmed ? 'icon' : 'sm'} className={h.confirmed ? 'h-8 w-8' : ''}
                onClick={() => setEdit({ old: h, date: h.holiday_date, name: h.name })}>
                {h.confirmed ? <Pencil className="h-4 w-4" /> : 'Confirm date'}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => {
                if (!window.confirm(`Delete ${h.name}? Months already generated keep their own copy of holidays.`)) return;
                try { await del.mutateAsync(h.holiday_date); } catch (err: any) { toast.error(err?.message || 'Could not delete.'); }
              }}><Trash2 className="h-4 w-4" /></Button>
            </span>
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={o => { if (!o) setEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{edit?.old.confirmed ? 'Edit holiday' : 'Confirm holiday date'}</DialogTitle>
            <DialogDescription>Months not yet generated pick up the change. Generated months keep what they were generated with.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Date</Label><Input type="date" value={edit?.date || ''} onChange={e => edit && setEdit({ ...edit, date: e.target.value })} /></div>
            <div><Label>Name</Label><Input value={edit?.name || ''} onChange={e => edit && setEdit({ ...edit, name: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={update.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HolidaysTab;
