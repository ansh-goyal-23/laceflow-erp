import React, { useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { monthLabel } from '@/components/salary/common';
import { useDeleteSalaryUpload, useSalaryUploadsList } from '@/hooks/useSalary';

interface Props { onFile: (file: File | undefined) => void; busy: boolean }

const UploadTab: React.FC<Props> = ({ onFile, busy }) => {
  const ref = useRef<HTMLInputElement>(null);
  const { data: uploads = [] } = useSalaryUploadsList();
  const del = useDeleteSalaryUpload();

  const remove = async (u: { id: string; month: string; file_name: string | null }) => {
    if (!window.confirm(
      `Delete the ${monthLabel(u.month)} attendance sheet${u.file_name ? ` (${u.file_name})` : ''}?\n\n` +
      'The machine punches from it are removed. Manual time corrections, advances and payments are kept. The deletion is saved in the audit log.',
    )) return;
    try { await del.mutateAsync(u); toast.success('Attendance sheet deleted.'); }
    catch (err: any) { toast.error(err?.message || 'Could not delete.'); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          Upload the attendance file exported from the thumb-print machine (.xls or .xlsx). Only its "Logs" sheet is used; the month is read from the
          file. People who are not in the master list yet are added automatically, with no salary set. Uploading a month again replaces that month's
          machine punches; your manual corrections are kept. A month that has been generated must be reopened first.
        </p>
        <input ref={ref} type="file" accept=".xls,.xlsx" className="hidden" onChange={e => { onFile(e.target.files?.[0]); if (ref.current) ref.current.value = ''; }} />
        <Button onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Upload attendance sheet
        </Button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead><TableHead>File</TableHead><TableHead>Uploaded by</TableHead><TableHead>Uploaded on</TableHead>
              <TableHead className="text-right">Delete</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {uploads.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No uploads yet.</TableCell></TableRow>}
            {uploads.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{monthLabel(u.month)}</TableCell>
                <TableCell>{u.file_name || '-'}</TableCell>
                <TableCell className="text-sm">{u.uploaded_by || 'unknown'}</TableCell>
                <TableCell className="text-xs">{new Date(u.uploaded_at).toLocaleString('en-IN')}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete this sheet" disabled={del.isPending} onClick={() => remove(u)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UploadTab;
