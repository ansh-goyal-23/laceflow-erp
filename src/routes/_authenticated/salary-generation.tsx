import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, CalendarDays, Check, Clock3, Download, FileSpreadsheet, FileUp, History, IndianRupee, Pencil, Plus, Printer, Search, Settings2, Trash2, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import {
  calculateEmployeeSalary, DEFAULT_RULES, formatHoursMinutes, isSunday, money, monthDates,
  parseAttendanceWorkbook, settingsForMonth, type ParsedAttendance, type SalaryAdvance, type SalaryDay,
  type SalaryEmployee, type SalaryEdit, type SalaryPayment, type SalaryRules, type SalarySettings,
  type SalaryState, type SalaryUpload,
} from "@/lib/salary-engine";
import {
  addAdvance, addHoliday, loadSalaryState, markSalaryPaid, removeHoliday, saveAttendanceEdit,
  saveAttendanceUpload, saveEmployee, saveEmployeeSettings, saveGlobalRules,
} from "@/lib/salary-store";

export const Route = createFileRoute("/_authenticated/salary-generation")({
  head: () => ({
    meta: [
      { title: "Salary Generation | Shree Lace ERP" },
      { name: "description", content: "Monthly attendance, salary calculations, advances and payment tracking." },
      { property: "og:title", content: "Salary Generation | Shree Lace ERP" },
      { property: "og:description", content: "Monthly attendance, salary calculations, advances and payment tracking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalaryGenerationPage,
});

type Section = "overview" | "upload" | "employees" | "advances" | "holidays" | "audit";
const SECTIONS: Array<{ id: Section; label: string; icon: typeof Users }> = [
  { id: "overview", label: "Salary Overview", icon: IndianRupee },
  { id: "upload", label: "Upload Attendance", icon: FileUp },
  { id: "employees", label: "Employees & Salary Settings", icon: Users },
  { id: "advances", label: "Advances", icon: Wallet },
  { id: "holidays", label: "Holidays", icon: CalendarDays },
  { id: "audit", label: "Audit Log", icon: History },
];
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);
const formatMonth = (month: string) => {
  const [year, monthNum] = month.split("-").map(Number);
  return new Date(year ?? 2026, (monthNum ?? 1) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

function SalaryGenerationPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canOpen = isAdmin || user?.role === "accounts";
  const [section, setSection] = useState<Section>("overview");
  const [state, setState] = useState<SalaryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [showNoPunches, setShowNoPunches] = useState(false);
  const [cardEmployee, setCardEmployee] = useState<SalaryEmployee | null>(null);
  const [editTarget, setEditTarget] = useState<{ employee: SalaryEmployee; date: string; field: "in_time" | "out_time"; value: string } | null>(null);
  const [payTarget, setPayTarget] = useState<SalaryEmployee | null>(null);
  const [payForm, setPayForm] = useState({ paidOn: today(), paymentMode: "Bank transfer", remarks: "", recovery: "" });
  const [employeeTarget, setEmployeeTarget] = useState<SalaryEmployee | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedAttendance | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [auditMonth, setAuditMonth] = useState("");
  const [rulesDraft, setRulesDraft] = useState<SalaryRules>(DEFAULT_RULES);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadSalaryState();
      setState(next);
      setRulesDraft(next.rules);
      if (next.uploads[0]?.month) setSelectedMonth((selected) => selected === currentMonth() ? next.uploads[0]?.month ?? selected : selected);
    } catch (error) {
      toast.error(`Salary data could not be loaded: ${(error as Error).message}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const monthUploads = state?.uploads ?? [];
  const monthEmployees = useMemo(() => (state?.employees ?? []).map((employee) => ({
    employee, summary: state ? calculateEmployeeSalary(employee, selectedMonth, state) : null,
  })).filter((row) => row.summary !== null), [state, selectedMonth]);
  const visibleEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return monthEmployees.filter(({ employee, summary }) => {
      if (!summary) return false;
      const hasPunches = summary.days.some((day) => day.rawPunches.length > 0 || day.inTime || day.outTime);
      if (!showNoPunches && !hasPunches) return false;
      return !needle || [employee.name, employee.machineNo, employee.department].some((value) => value.toLowerCase().includes(needle));
    });
  }, [monthEmployees, search, showNoPunches]);
  const monthAdvances = (state?.advances ?? []).filter((advance) => advance.monthToDeductFrom === selectedMonth);
  const totals = visibleEmployees.reduce((sum, { summary }) => ({
    salary: sum.salary + (summary?.grossSalary ?? 0), advances: sum.advances + (summary?.advanceRecovered ?? 0),
    toPay: sum.toPay + (summary?.amountPayable ?? 0), paid: sum.paid + (summary?.payment?.status === "Paid" && !summary.payment.changedAfterPayment ? summary.amountPayable : 0),
    unpaid: sum.unpaid + (summary?.payment?.status === "Paid" && !summary.payment.changedAfterPayment ? 0 : summary?.amountPayable ?? 0),
  }), { salary: 0, advances: 0, toPay: 0, paid: 0, unpaid: 0 });

  if (!canOpen) return <div className="p-8 text-sm text-muted-foreground">This area is available to administrators and Accounts users.</div>;

  async function handleSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) { toast.error("Please choose an .xls or .xlsx attendance file."); return; }
    setUploadFile(file); setParsed(null); setParsing(true);
    try {
      const result = await parseAttendanceWorkbook(file);
      setParsed(result); setSelectedMonth(result.month);
      toast.success(`Found ${result.employees.length} employees in ${formatMonth(result.month)}.`);
    } catch (error) { setUploadFile(null); toast.error((error as Error).message); }
    finally { setParsing(false); }
  }

  async function confirmUpload() {
    if (!parsed || !uploadFile || !state) return;
    const prior = state.uploads.find((upload) => upload.month === parsed.month && upload.status === "active") ?? null;
    if (prior && !window.confirm(`Replace ${formatMonth(parsed.month)} attendance? Existing manual edits will be reapplied.`)) return;
    const keepEdits = new Map(state.days.filter((day) => day.month === parsed.month && (day.inTimeEdited || day.outTimeEdited)).map((day) => [`${day.employeeId}|${day.date}`, day]));
    setSaving(true);
    try {
      await saveAttendanceUpload(uploadFile, parsed, prior, keepEdits);
      setSection("overview"); setParsed(null); setUploadFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await refresh(); toast.success("Attendance saved.");
    } catch (error) { toast.error(`Attendance was not saved: ${(error as Error).message}`); }
    finally { setSaving(false); }
  }

  async function saveRules() {
    setSaving(true);
    try { await saveGlobalRules(rulesDraft); await refresh(); toast.success("Global rules saved."); }
    catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  async function submitAttendanceEdit(value: string, reason: string) {
    if (!editTarget) return;
    setSaving(true);
    try { await saveAttendanceEdit({ employeeId: editTarget.employee.id, date: editTarget.date, field: editTarget.field, value, reason }); await refresh(); setEditTarget(null); toast.success("Attendance updated; salary recalculated."); }
    catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  async function submitPaid() {
    if (!payTarget || !state) return;
    const summary = calculateEmployeeSalary(payTarget, selectedMonth, state);
    if (!summary) return;
    setSaving(true);
    try {
      await markSalaryPaid({ employeeId: payTarget.id, salaryMonth: selectedMonth, grossSalary: summary.grossSalary,
        advanceRecovered: Number(payForm.recovery), dueAdvances: summary.dueAdvances, paidOn: payForm.paidOn,
        paymentMode: payForm.paymentMode, remarks: payForm.remarks });
      setPayTarget(null); await refresh(); toast.success("Salary marked as paid.");
    } catch (error) { toast.error((error as Error).message); }
    finally { setSaving(false); }
  }

  function exportOverview(kind: "csv" | "xlsx") {
    const headers = ["Employee", "Machine No", "Days Present", "Overtime", "Total Paid Hours", "Salary", "Advance Taken", "Amount to Pay", "Status"];
    const rows = visibleEmployees.map(({ employee, summary }) => [employee.name, employee.machineNo, summary?.daysPresent ?? 0,
      formatHoursMinutes(summary?.overtimeMinutes ?? 0), (summary?.paidMinutes ?? 0) / 60, summary?.grossSalary ?? 0,
      summary?.advanceRecovered ?? 0, summary?.amountPayable ?? 0,
      summary?.payment?.status === "Paid" && !summary.payment.changedAfterPayment ? "Paid" : "Unpaid"] as (string | number)[]);
    rows.push(["TOTAL", "", visibleEmployees.reduce((sum, row) => sum + (row.summary?.daysPresent ?? 0), 0), "",
      visibleEmployees.reduce((sum, row) => sum + (row.summary?.paidMinutes ?? 0), 0) / 60,
      totals.salary, totals.advances, totals.toPay, `Paid ${money(totals.paid)} · Unpaid ${money(totals.unpaid)}`]);
    if (kind === "csv") exportCSV(`salary-overview-${selectedMonth}.csv`, headers, rows);
    else exportXLSX(`salary-overview-${selectedMonth}.xlsx`, "Salary Overview", headers, rows);
  }

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="salary-month">Payroll month</Label><Input id="salary-month" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></div>
          <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={showNoPunches} onCheckedChange={setShowNoPunches} />Show employees with no punches</label>
        </div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => exportOverview("csv")}><Download />CSV</Button><Button variant="outline" size="sm" onClick={() => exportOverview("xlsx")}><FileSpreadsheet />Excel</Button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Salary", totals.salary, IndianRupee], ["Advances recovered", totals.advances, Wallet], ["Amount to pay", totals.toPay, IndianRupee], ["Paid", totals.paid, Check], ["Unpaid", totals.unpaid, Clock3]].map(([label, value, Icon]) => {
          const CardIcon = Icon as typeof IndianRupee;
          return <Card key={String(label)}><CardContent className="flex items-center justify-between p-4"><div><div className="text-xs text-muted-foreground">{String(label)}</div><div className="mt-1 text-lg font-semibold">{money(Number(value))}</div></div><CardIcon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>;
        })}
      </div>
      <p className="text-sm text-muted-foreground">Salary for {formatMonth(selectedMonth)} is paid on the 10th of the following month.</p>
      {!monthUploads.some((upload) => upload.month === selectedMonth && upload.status === "active") && <div className="border-y py-10 text-center"><p className="font-medium">Upload this month’s attendance to begin.</p><Button className="mt-3" onClick={() => setSection("upload")}><FileUp />Upload Attendance</Button></div>}
      {monthEmployees.some(({ summary }) => !summary) && null}
      {state?.employees.some((employee) => !settingsForMonth(employee, selectedMonth)) && <div className="flex items-start gap-2 border-y py-3 text-sm text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4" />Employees without salary settings are excluded from salary totals. Add settings in Employees & Salary Settings.</div>}
      {visibleEmployees.length > 0 && <div className="overflow-hidden border-y">
        <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Days Present</TableHead><TableHead>Overtime</TableHead><TableHead>Total Paid Hours</TableHead><TableHead>Salary</TableHead><TableHead>Advance Taken</TableHead><TableHead>Amount to Pay</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>{visibleEmployees.map(({ employee, summary }) => {
            if (!summary) return null;
            const paid = summary.payment?.status === "Paid" && !summary.payment.changedAfterPayment;
            return <TableRow key={employee.id}><TableCell><div className="font-medium">{employee.name}</div><div className="text-xs text-muted-foreground">No. {employee.machineNo}{employee.department ? ` · ${employee.department}` : ""}</div></TableCell><TableCell>{summary.daysPresent}</TableCell><TableCell>{formatHoursMinutes(summary.overtimeMinutes)}</TableCell><TableCell>{(summary.paidMinutes / 60).toFixed(2)}</TableCell><TableCell>{money(summary.grossSalary)}</TableCell><TableCell title={`This month: ${money(summary.advancesGiven)} · Carried forward: ${money(summary.carriedBalance)}`}>{money(summary.advanceRecovered)}</TableCell><TableCell className="font-medium">{money(summary.amountPayable)}</TableCell><TableCell><Badge variant={paid ? "default" : "secondary"}>{summary.payment?.changedAfterPayment ? "Unpaid · changed" : paid ? "Paid" : "Unpaid"}</Badge></TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="outline" size="sm" onClick={() => setCardEmployee(employee)}>View Salary Card</Button>{isAdmin && !paid && <Button size="sm" onClick={() => { setPayTarget(employee); setPayForm({ paidOn: today(), paymentMode: "Bank transfer", remarks: "", recovery: String(Math.min(summary.dueAdvances, summary.grossSalary)) }); }}>Mark as paid</Button>}</div></TableCell></TableRow>;
          })}</TableBody>
        </Table>
        <div className="grid grid-cols-2 gap-2 border-t bg-muted/30 px-3 py-3 text-sm sm:grid-cols-5"><span className="font-semibold">Totals</span><span>Salary {money(totals.salary)}</span><span>Advances {money(totals.advances)}</span><span>To pay {money(totals.toPay)}</span><span>Paid {money(totals.paid)} · Unpaid {money(totals.unpaid)}</span></div>
      </div>}
      {!loading && monthEmployees.length > 0 && visibleEmployees.length === 0 && <p className="border-y py-8 text-center text-sm text-muted-foreground">No employees match this search.</p>}
    </div>
  );

  const renderUpload = () => (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card><CardHeader><CardTitle>Upload monthly attendance</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="rounded-md border border-dashed p-6 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 font-medium">Choose an attendance workbook</p><p className="mt-1 text-sm text-muted-foreground">Accepted formats: .xls and .xlsx. Only the Logs sheet is read.</p><Input ref={fileRef} className="mx-auto mt-4 max-w-md" type="file" accept=".xls,.xlsx" onChange={(event) => void handleSelectFile(event)} />{parsing && <p className="mt-3 text-sm text-muted-foreground">Reading attendance…</p>}</div>
        {parsed && <div className="space-y-4 border-t pt-4"><div className="flex flex-wrap gap-6"><div><div className="text-xs text-muted-foreground">Detected month</div><div className="font-semibold">{formatMonth(parsed.month)}</div></div><div><div className="text-xs text-muted-foreground">Employees found</div><div className="font-semibold">{parsed.employees.length}</div></div><div><div className="text-xs text-muted-foreground">With punches</div><div className="font-semibold">{parsed.employees.filter((employee) => Object.keys(employee.punches).length > 0).length}</div></div></div>
          {parsed.warnings.length > 0 && <div className="max-h-48 overflow-auto border-y py-3"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><AlertCircle className="h-4 w-4" />Punch warnings ({parsed.warnings.length})</div><ul className="space-y-1 text-sm text-muted-foreground">{parsed.warnings.slice(0, 100).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>{parsed.warnings.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Showing first 100 warnings.</p>}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{uploadFile?.name}</span><Button onClick={() => void confirmUpload()} disabled={saving}>{saving ? "Saving…" : "Confirm and save"}</Button></div>
        </div>}
      </CardContent></Card>
      <div className="border-y py-3 text-sm text-muted-foreground">Previous uploads stay available in the upload history. Replacing a month preserves manual time edits by employee and date.</div>
      {(state?.uploads.length ?? 0) > 0 && <Card><CardHeader><CardTitle>Upload history</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead>File</TableHead><TableHead>Version</TableHead><TableHead>Uploaded</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{state?.uploads.map((upload) => <TableRow key={upload.id}><TableCell>{formatMonth(upload.month)}</TableCell><TableCell>{upload.fileName}</TableCell><TableCell>{upload.version}</TableCell><TableCell>{new Date(upload.uploadedAt).toLocaleString("en-IN")}</TableCell><TableCell>{upload.status}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    </div>
  );

  const renderEmployees = () => (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Employees and salary settings</h2><p className="text-sm text-muted-foreground">Salary history applies from its effective month forward.</p></div>{isAdmin && <Button onClick={() => setEmployeeTarget(null)}><Plus />Add employee</Button>}</div>
      <div className="overflow-hidden border-y"><Table><TableHeader><TableRow><TableHead>Machine No.</TableHead><TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Active</TableHead><TableHead>Monthly Salary</TableHead><TableHead>Working Hours</TableHead><TableHead>Shift Length</TableHead><TableHead>Effective From</TableHead><TableHead /></TableRow></TableHeader><TableBody>{state?.employees.map((employee) => {
        const settings = settingsForMonth(employee, selectedMonth) ?? [...employee.settings].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
        return <TableRow key={employee.id}><TableCell>{employee.machineNo}</TableCell><TableCell className="font-medium">{employee.name}</TableCell><TableCell>{employee.department || "—"}</TableCell><TableCell><Badge variant={employee.isActive ? "default" : "secondary"}>{employee.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell>{settings ? money(settings.monthlySalary) : <span className="text-muted-foreground">Add salary settings</span>}</TableCell><TableCell>{settings ? `${settings.workingHoursPerDay}h / day` : "—"}</TableCell><TableCell>{settings ? `${settings.shiftLengthInclLunchHours}h` : "—"}</TableCell><TableCell>{settings?.effectiveFrom || "—"}</TableCell><TableCell className="text-right">{isAdmin && <Button variant="ghost" size="icon" title="Edit employee and salary settings" onClick={() => setEmployeeTarget(employee)}><Pencil /></Button>}</TableCell></TableRow>;
      })}</TableBody></Table></div>
      {isAdmin ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4" />Global Rules</CardTitle></CardHeader><CardContent><RulesForm rules={rulesDraft} onChange={setRulesDraft} onSave={() => void saveRules()} saving={saving} /></CardContent></Card> : <div className="border-y py-3 text-sm text-muted-foreground">Only administrators can edit employee and salary settings.</div>}
    </div>
  );

  const renderAdvances = () => (
    <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Advance ledger</h2><p className="text-sm text-muted-foreground">Advances are recovered from the selected salary month.</p></div><Button onClick={() => setAdvanceOpen(true)}><Plus />Add advance</Button></div>
      <div className="flex items-end gap-3"><div className="space-y-1"><Label>Deduction month</Label><Input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} /></div></div>
      <div className="overflow-hidden border-y"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Given this month</TableHead><TableHead>Recovered this month</TableHead><TableHead>Balance carried forward</TableHead><TableHead>Advance entries</TableHead></TableRow></TableHeader><TableBody>{(state?.employees ?? []).map((employee) => {
        const summary = state ? calculateEmployeeSalary(employee, selectedMonth, state) : null;
        if (!summary && !monthAdvances.some((advance) => advance.employeeId === employee.id)) return null;
        const entries = monthAdvances.filter((advance) => advance.employeeId === employee.id);
        return <TableRow key={employee.id}><TableCell className="font-medium">{employee.name}</TableCell><TableCell>{money(summary?.advancesGiven ?? entries.reduce((sum, row) => sum + row.amount, 0))}</TableCell><TableCell>{money(summary?.payment?.advanceRecovered ?? 0)}</TableCell><TableCell>{money(summary?.carriedBalance ?? 0)}</TableCell><TableCell>{entries.length ? entries.map((entry) => `${entry.type}: ${money(entry.amount)}`).join(" · ") : "—"}</TableCell></TableRow>;
      })}</TableBody></Table></div>
      <div className="border-y py-3 text-sm text-muted-foreground">Maximum regular advance guideline: {state?.rules.advanceMaxPercentOfSalary ?? 50}% of monthly salary. The limit warns but does not block entry. Recoveries cannot exceed salary; the remainder carries forward.</div>
    </div>
  );

  const renderHolidays = () => <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Holiday calendar</h2><p className="text-sm text-muted-foreground">Sundays are treated as paid holidays automatically.</p></div><Button onClick={() => setHolidayOpen(true)}><Plus />Add holiday</Button></div><div className="overflow-hidden border-y"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead /></TableRow></TableHeader><TableBody>{(state?.holidays ?? []).filter((holiday) => holiday.date.startsWith(selectedMonth.slice(0, 4))).sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => <TableRow key={holiday.date}><TableCell>{holiday.date}</TableCell><TableCell>{new Date(`${holiday.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" })}</TableCell><TableCell>{holiday.name}</TableCell><TableCell>{holiday.isRecurringSunday ? "Recurring Sunday" : "Manual"}</TableCell><TableCell className="text-right">{isAdmin && <Button variant="ghost" size="icon" title="Remove holiday" onClick={async () => { try { await removeHoliday(holiday.date); await refresh(); toast.success("Holiday removed."); } catch (error) { toast.error((error as Error).message); } }}><Trash2 /></Button>}</TableCell></TableRow>)}</TableBody></Table></div>{isAdmin ? <div className="border-y py-3 text-sm text-muted-foreground">The default list includes Republic Day, Maha Shivratri, Holi, Raksha Bandhan, Independence Day, Gandhi Jayanti, Dussehra, Diwali and Govardhan Puja. Add festival dates each year.</div> : <div className="text-sm text-muted-foreground">Only administrators can change the holiday calendar.</div>}</div>;

  const filteredEdits = (state?.edits ?? []).filter((edit) => (!employeeFilter || employeeFilter === "all" || edit.employeeId === employeeFilter) && (!auditMonth || edit.date.startsWith(auditMonth)));
  const renderAudit = () => <div className="space-y-4"><div><h2 className="font-semibold">Attendance edit history</h2><p className="text-sm text-muted-foreground">This log is append-only. Every attendance correction keeps its reason and author.</p></div><div className="flex flex-wrap gap-3"><div className="min-w-56 space-y-1"><Label>Employee</Label><Select value={employeeFilter} onValueChange={setEmployeeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All employees</SelectItem>{state?.employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Month</Label><Input type="month" value={auditMonth} onChange={(event) => setAuditMonth(event.target.value)} /></div></div><div className="overflow-hidden border-y"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Field</TableHead><TableHead>Old value</TableHead><TableHead>New value</TableHead><TableHead>Reason</TableHead><TableHead>Edited by</TableHead><TableHead>When</TableHead></TableRow></TableHeader><TableBody>{filteredEdits.map((edit) => <TableRow key={edit.id}><TableCell>{edit.date}</TableCell><TableCell>{state?.employees.find((employee) => employee.id === edit.employeeId)?.name ?? edit.employeeId}</TableCell><TableCell>{edit.field === "in_time" ? "In time" : "Out time"}</TableCell><TableCell>{edit.oldValue || "—"}</TableCell><TableCell>{edit.newValue || "Machine value"}</TableCell><TableCell>{edit.reason}</TableCell><TableCell>{edit.editedBy}</TableCell><TableCell>{new Date(edit.editedAt).toLocaleString("en-IN")}</TableCell></TableRow>)}</TableBody></Table>{filteredEdits.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No attendance edits found.</p>}</div></div>;

  const selectedSection = SECTIONS.find((item) => item.id === section);
  return <div className="p-4 md:p-8">
    <PageHeader title="Salary Generation" subtitle="Attendance, payroll and advances" actions={<Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>Refresh</Button>} />
    <div className="mb-6 flex gap-1 overflow-x-auto border-b pb-2" role="tablist" aria-label="Salary Generation sections">
      {SECTIONS.map((item) => { const Icon = item.icon; return <Button key={item.id} variant={section === item.id ? "secondary" : "ghost"} size="sm" className="shrink-0" role="tab" aria-selected={section === item.id} onClick={() => setSection(item.id)}><Icon />{item.label}</Button>; })}
    </div>
    {loading && !state ? <p className="py-12 text-center text-sm text-muted-foreground">Loading salary records…</p> : <>
      {section === "overview" && renderOverview()}{section === "upload" && renderUpload()}{section === "employees" && renderEmployees()}{section === "advances" && renderAdvances()}{section === "holidays" && renderHolidays()}{section === "audit" && renderAudit()}
      <section className="mt-8 border-t pt-4"><details><summary className="cursor-pointer text-sm font-medium">How salary is calculated</summary><div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2"><p>Machine punches before 06:00 are ignored. In and out use the first and last remaining punches; incomplete days are absent unless staff add a missing time with a reason.</p><p>Late arrivals shift the required finishing time. Extra time beyond the grace period counts as overtime; time on short days is also included as overtime at the regular hourly rate.</p><p>Lunch is deducted only when the employee is present across the lunch window and leaves before their personal cut-off. Worked time rounds to the nearest configured increment.</p><p>Paid holidays and Sundays count as a working day. Monthly salary is divided by calendar days and working hours, then multiplied by total paid hours. Advances are deducted up to salary; remaining balance carries forward.</p></div></details></section>
    </>}
    <SalaryCardDialog employee={cardEmployee} month={selectedMonth} state={state} open={Boolean(cardEmployee)} onClose={() => setCardEmployee(null)} onEdit={(employee, date, field, value) => setEditTarget({ employee, date, field, value })} onPaid={(employee) => { const summary = state ? calculateEmployeeSalary(employee, selectedMonth, state) : null; if (!summary) return; setPayTarget(employee); setPayForm({ paidOn: today(), paymentMode: "Bank transfer", remarks: "", recovery: String(Math.min(summary.dueAdvances, summary.grossSalary)) }); }} isAdmin={isAdmin} />
    <AttendanceEditDialog target={editTarget} state={state} saving={saving} onClose={() => setEditTarget(null)} onSave={submitAttendanceEdit} />
    <PaymentDialog employee={payTarget} form={payForm} setForm={setPayForm} saving={saving} onClose={() => setPayTarget(null)} onSave={() => void submitPaid()} />
    <EmployeeDialog employee={employeeTarget} open={employeeTarget !== null || false} onClose={() => setEmployeeTarget(null)} onSave={async (input, settings) => {
      setSaving(true); try { await saveEmployee(input); if (settings) { const targetId = input.id ?? (await loadSalaryState()).employees.find((employee) => employee.machineNo === input.machineNo)?.id; if (targetId) await saveEmployeeSettings(targetId, settings); }
        setEmployeeTarget(null); await refresh(); toast.success("Employee saved."); } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); }
    }} saving={saving} />
    <AdvanceDialog open={advanceOpen} employees={state?.employees ?? []} month={selectedMonth} maxPercent={state?.rules.advanceMaxPercentOfSalary ?? 50} saving={saving} onClose={() => setAdvanceOpen(false)} onSave={async (input) => { setSaving(true); try { await addAdvance(input); setAdvanceOpen(false); await refresh(); toast.success("Advance added."); } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); } }} />
    <HolidayDialog open={holidayOpen} saving={saving} onClose={() => setHolidayOpen(false)} onSave={async (holiday) => { setSaving(true); try { await addHoliday(holiday); setHolidayOpen(false); await refresh(); toast.success("Holiday saved."); } catch (error) { toast.error((error as Error).message); } finally { setSaving(false); } }} />
  </div>;
}

function RulesForm({ rules, onChange, onSave, saving }: { rules: SalaryRules; onChange: (rules: SalaryRules) => void; onSave: () => void; saving: boolean }) {
  const numeric: Array<[keyof SalaryRules, string, string]> = [
    ["otGraceMinutes", "Overtime grace (minutes)", "Extra time below this threshold does not count as overtime."],
    ["minOtMinutes", "Minimum overtime (minutes)", "Optional minimum qualifying overtime; zero counts every extra minute."],
    ["hoursRoundingMinutes", "Worked-hours rounding (minutes)", "Work hours round to this increment; halfway values round up."],
    ["advanceMaxPercentOfSalary", "Advance warning limit (%)", "Warn when regular advances exceed this share of salary."],
    ["salaryPayDay", "Salary pay day", "Salary is paid on this day of the following month."],
  ];
  const times: Array<[keyof SalaryRules, string, string]> = [
    ["ignorePunchesBefore", "Ignore punches before", "Earlier punches are treated as machine errors."],
    ["lunchWindowStart", "Lunch window starts", "Employee must still be on site after the lunch window."],
    ["lunchWindowEnd", "Lunch window ends", "Employee must have arrived before the lunch window."],
  ];
  const update = (key: keyof SalaryRules, value: string | number | boolean) => onChange({ ...rules, [key]: value });
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{numeric.map(([key, label, hint]) => <div className="space-y-1" key={key}><Label>{label}</Label><Input type="number" value={String(rules[key])} onChange={(event) => update(key, Number(event.target.value))} /><p className="text-xs text-muted-foreground">{hint}</p></div>)}{times.map(([key, label, hint]) => <div className="space-y-1" key={key}><Label>{label}</Label><Input type="time" value={String(rules[key])} onChange={(event) => update(key, event.target.value)} /><p className="text-xs text-muted-foreground">{hint}</p></div>)}</div><div className="flex flex-wrap gap-6"><label className="flex items-center gap-2 text-sm"><Switch checked={rules.holidaysArePaid} onCheckedChange={(value) => update("holidaysArePaid", value)} />Holidays are paid</label><label className="flex items-center gap-2 text-sm"><Switch checked={rules.holidayHoursEqualWorkingHours} onCheckedChange={(value) => update("holidayHoursEqualWorkingHours", value)} />Holiday hours equal daily hours</label></div><Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save global rules"}</Button></div>;
}

function SalaryCardDialog({ employee, month, state, open, onClose, onEdit, onPaid, isAdmin }: { employee: SalaryEmployee | null; month: string; state: SalaryState | null; open: boolean; onClose: () => void; onEdit: (employee: SalaryEmployee, date: string, field: "in_time" | "out_time", value: string) => void; onPaid: (employee: SalaryEmployee) => void; isAdmin: boolean }) {
  const summary = employee && state ? calculateEmployeeSalary(employee, month, state) : null;
  const paid = summary?.payment?.status === "Paid" && !summary.payment.changedAfterPayment;
  const employeeEdits = state?.edits.filter((edit) => edit.employeeId === employee?.id && edit.date.startsWith(month)) ?? [];
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>Salary Card · {employee?.name}</DialogTitle><DialogDescription>{formatMonth(month)} · Machine No. {employee?.machineNo}</DialogDescription></DialogHeader>
    {employee && summary && <div className="space-y-4" id="salary-card-print"><div className="grid grid-cols-2 gap-3 border-y py-4 text-sm md:grid-cols-4"><Metric label="Monthly salary" value={money(summary.settings.monthlySalary)} /><Metric label="Working hours / day" value={`${summary.settings.workingHoursPerDay}h`} /><Metric label="Days present" value={String(summary.daysPresent)} /><Metric label="Total overtime" value={formatHoursMinutes(summary.overtimeMinutes)} /><Metric label="Regular hours" value={formatHoursMinutes(summary.regularMinutes)} /><Metric label="Total paid hours" value={(summary.paidMinutes / 60).toFixed(2)} /><Metric label="Salary calculated" value={money(summary.grossSalary)} /><Metric label="Advance recovered · to pay" value={`${money(summary.advanceRecovered)} · ${money(summary.amountPayable)}`} /></div>
      {summary.payment?.changedAfterPayment && <div className="border-y py-2 text-sm text-destructive">Attendance changed after payment. This salary is now marked unpaid and needs review.</div>}
      <div className="overflow-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>In Time</TableHead><TableHead>Out Time</TableHead><TableHead>Hours Worked</TableHead><TableHead>Overtime</TableHead><TableHead>Status / Warnings</TableHead><TableHead /></TableRow></TableHeader><TableBody>{summary.days.map((day) => {
        const stored = state?.days.find((entry) => entry.employeeId === employee.id && entry.date === day.date);
        const inEdited = Boolean(stored?.inTimeEdited); const outEdited = Boolean(stored?.outTimeEdited);
        const holiday = day.status === "Holiday";
        return <TableRow key={day.date}><TableCell>{day.date.slice(-2)}</TableCell><TableCell>{day.dayName}</TableCell><TableCell title={inEdited ? `Machine value: ${day.rawPunches[0] ?? "none"}` : undefined}>{holiday ? "H / Holiday" : <button type="button" className="underline decoration-dotted" onClick={() => onEdit(employee, day.date, "in_time", day.inTime)}>{day.inTime || "—"}{inEdited && <span className="ml-1 text-primary">•</span>}</button>}</TableCell><TableCell title={outEdited ? `Machine value: ${day.rawPunches[day.rawPunches.length - 1] ?? "none"}` : undefined}>{holiday ? "H / Holiday" : <button type="button" className="underline decoration-dotted" onClick={() => onEdit(employee, day.date, "out_time", day.outTime)}>{day.outTime || "—"}{outEdited && <span className="ml-1 text-primary">•</span>}</button>}</TableCell><TableCell>{holiday ? "H / Holiday" : formatHoursMinutes(day.paidMinutes - (day.status === "Present" ? day.overtimeMinutes : 0))}</TableCell><TableCell>{day.overtimeMinutes ? formatHoursMinutes(day.overtimeMinutes) : "—"}</TableCell><TableCell><div>{day.status}{day.flags.length > 0 && <span className="ml-1 text-amber-700" title={day.flags.join(" · ")}><AlertCircle className="inline h-4 w-4" /></span>}</div>{day.flags.length > 0 && <div className="max-w-52 text-xs text-muted-foreground">{day.flags.join(" · ")}</div>}{day.rawPunches.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Raw punches ({day.rawPunches.length})</summary>{day.rawPunches.join(" · ")}</details>}</TableCell><TableCell>{stored?.inTimeEdited || stored?.outTimeEdited ? <div className="flex gap-1">{stored.inTimeEdited && <Button variant="ghost" size="sm" onClick={() => onEdit(employee, day.date, "in_time", day.rawPunches[0] ?? "")}>Reset in</Button>}{stored.outTimeEdited && <Button variant="ghost" size="sm" onClick={() => onEdit(employee, day.date, "out_time", day.rawPunches[day.rawPunches.length - 1] ?? "")}>Reset out</Button>}</div> : null}</TableCell></TableRow>;
      })}</TableBody></Table></div>
      <details><summary className="cursor-pointer font-medium">Edit history ({employeeEdits.length})</summary><div className="mt-3 overflow-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Field</TableHead><TableHead>Old</TableHead><TableHead>New</TableHead><TableHead>Reason</TableHead><TableHead>By</TableHead><TableHead>When</TableHead></TableRow></TableHeader><TableBody>{employeeEdits.map((edit) => <TableRow key={edit.id}><TableCell>{edit.date}</TableCell><TableCell>{edit.field}</TableCell><TableCell>{edit.oldValue || "—"}</TableCell><TableCell>{edit.newValue || "Machine value"}</TableCell><TableCell>{edit.reason}</TableCell><TableCell>{edit.editedBy}</TableCell><TableCell>{new Date(edit.editedAt).toLocaleString("en-IN")}</TableCell></TableRow>)}</TableBody></Table></div></details>
    </div>}
    <DialogFooter className="gap-2 sm:flex-row"><Button variant="outline" onClick={() => window.print()}><Printer />Print / PDF</Button><Button variant="outline" onClick={() => { if (employee && summary) exportXLSX(`salary-card-${employee.machineNo}-${month}.xlsx`, "Salary Card", ["Date", "Day", "In", "Out", "Hours worked", "Overtime", "Status"], summary.days.map((day) => [day.date, day.dayName, day.inTime, day.outTime, formatHoursMinutes(day.paidMinutes), formatHoursMinutes(day.overtimeMinutes), day.status])); }}><FileSpreadsheet />Excel</Button>{isAdmin && employee && !paid && <Button onClick={() => onPaid(employee)}>Mark as paid</Button>}<Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>; }

function AttendanceEditDialog({ target, state, saving, onClose, onSave }: { target: { employee: SalaryEmployee; date: string; field: "in_time" | "out_time"; value: string } | null; state: SalaryState | null; saving: boolean; onClose: () => void; onSave: (value: string, reason: string) => Promise<void> }) {
  const [value, setValue] = useState(""); const [reason, setReason] = useState("");
  useEffect(() => { setValue(target?.value ?? ""); setReason(""); }, [target]);
  const paid = target && state?.payments.some((payment) => payment.employeeId === target.employee.id && payment.salaryMonth === target.date.slice(0, 7) && payment.status === "Paid");
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{target?.field === "in_time" ? "Edit in time" : "Edit out time"}</DialogTitle><DialogDescription>{target?.employee.name} · {target?.date}. Original machine punches remain unchanged.</DialogDescription></DialogHeader>{paid && <div className="border-y py-2 text-sm text-destructive">This month was paid. Saving this edit requires a reason and will return the salary to unpaid for review.</div>}<div className="space-y-3"><div className="space-y-1"><Label>Time</Label><Input type="time" value={value} onChange={(event) => setValue(event.target.value)} /></div><div className="space-y-1"><Label>Reason (required)</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the correction" /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || !reason.trim()} onClick={() => void onSave(value, reason)}>{saving ? "Saving…" : "Save correction"}</Button></DialogFooter></DialogContent></Dialog>;
}

function PaymentDialog({ employee, form, setForm, saving, onClose, onSave }: { employee: SalaryEmployee | null; form: { paidOn: string; paymentMode: string; remarks: string; recovery: string }; setForm: (form: { paidOn: string; paymentMode: string; remarks: string; recovery: string }) => void; saving: boolean; onClose: () => void; onSave: () => void }) {
  return <Dialog open={Boolean(employee)} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Mark salary paid</DialogTitle><DialogDescription>{employee?.name} · {formatMonth(currentMonth())}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Paid on</Label><Input type="date" value={form.paidOn} onChange={(event) => setForm({ ...form, paidOn: event.target.value })} /></div><div className="space-y-1"><Label>Payment mode</Label><Select value={form.paymentMode} onValueChange={(value) => setForm({ ...form, paymentMode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Bank transfer">Bank transfer</SelectItem><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Cheque">Cheque</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div><div className="space-y-1"><Label>Advance recovery</Label><Input type="number" min="0" value={form.recovery} onChange={(event) => setForm({ ...form, recovery: event.target.value })} /></div><div className="space-y-1 sm:col-span-2"><Label>Remarks</Label><Textarea value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || !form.paidOn} onClick={onSave}>{saving ? "Saving…" : "Confirm payment"}</Button></DialogFooter></DialogContent></Dialog>;
}

function EmployeeDialog({ employee, open, onClose, onSave, saving }: { employee: SalaryEmployee | null; open: boolean; onClose: () => void; onSave: (employee: { id?: string; machineNo: string; name: string; department: string; isActive: boolean; joinedOn: string; leftOn: string }, settings: SalarySettings | null) => Promise<void>; saving: boolean }) {
  const latest = employee?.settings.toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const [form, setForm] = useState({ machineNo: "", name: "", department: "", isActive: true, joinedOn: today(), leftOn: "" });
  const [settings, setSettings] = useState<SalarySettings>({ monthlySalary: 0, workingHoursPerDay: 8, shiftStartTime: "09:00", shiftLengthInclLunchHours: 8.5, lunchMinutes: 30, lunchUnpaidIfOutBefore: "23:59", effectiveFrom: currentMonth() + "-01" });
  const [hasSettings, setHasSettings] = useState(false);
  useEffect(() => { if (open) { setForm({ machineNo: employee?.machineNo ?? "", name: employee?.name ?? "", department: employee?.department ?? "", isActive: employee?.isActive ?? true, joinedOn: employee?.joinedOn || today(), leftOn: employee?.leftOn ?? "" }); setSettings(latest ?? { monthlySalary: 0, workingHoursPerDay: 8, shiftStartTime: "09:00", shiftLengthInclLunchHours: 8.5, lunchMinutes: 30, lunchUnpaidIfOutBefore: "23:59", effectiveFrom: currentMonth() + "-01" }); setHasSettings(Boolean(latest)); } }, [open, employee, latest]);
  const setField = (key: keyof SalarySettings, value: string | number) => setSettings({ ...settings, [key]: value });
  const submit = (event: React.FormEvent) => { event.preventDefault(); void onSave({ ...form, id: employee?.id, machineNo: form.machineNo.trim(), name: form.name.trim() }, hasSettings ? settings : null); };
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{employee ? "Employee and salary settings" : "Add employee"}</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Machine No." value={form.machineNo} onChange={(value) => setForm({ ...form, machineNo: value })} required disabled={Boolean(employee)} /><Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required /><Field label="Department" value={form.department} onChange={(value) => setForm({ ...form, department: value })} /><div className="flex items-center gap-2 pt-6"><Switch checked={form.isActive} onCheckedChange={(value) => setForm({ ...form, isActive: value, leftOn: value ? "" : form.leftOn || today() })} />Active employee</div><Field label="Joined on" type="date" value={form.joinedOn} onChange={(value) => setForm({ ...form, joinedOn: value })} /><Field label="Left on" type="date" value={form.leftOn} onChange={(value) => setForm({ ...form, leftOn: value, isActive: !value })} /></div><div className="flex items-center gap-2 border-t pt-4"><Switch checked={hasSettings} onCheckedChange={setHasSettings} /><span className="text-sm font-medium">{latest ? "Add a new effective salary setting" : "Add salary settings"}</span></div>{hasSettings && <div className="grid gap-3 sm:grid-cols-2"><Field label="Monthly salary (₹)" type="number" value={String(settings.monthlySalary)} onChange={(value) => setField("monthlySalary", Number(value))} required /><Field label="Working hours / day" type="number" value={String(settings.workingHoursPerDay)} onChange={(value) => setField("workingHoursPerDay", Number(value))} required /><Field label="Shift starts" type="time" value={settings.shiftStartTime} onChange={(value) => setField("shiftStartTime", value)} required /><Field label="Shift length incl. lunch" type="number" value={String(settings.shiftLengthInclLunchHours)} onChange={(value) => setField("shiftLengthInclLunchHours", Number(value))} required /><Field label="Lunch minutes" type="number" value={String(settings.lunchMinutes)} onChange={(value) => setField("lunchMinutes", Number(value))} /><Field label="Lunch unpaid if out before" type="time" value={settings.lunchUnpaidIfOutBefore} onChange={(value) => setField("lunchUnpaidIfOutBefore", value)} /><Field label="Effective from" type="date" value={settings.effectiveFrom} onChange={(value) => setField("effectiveFrom", value)} required /></div>}<DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save employee"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, value, onChange, type = "text", required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; disabled?: boolean }) { return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} /></div>; }

function AdvanceDialog({ open, employees, month, maxPercent, saving, onClose, onSave }: { open: boolean; employees: SalaryEmployee[]; month: string; maxPercent: number; saving: boolean; onClose: () => void; onSave: (input: Omit<SalaryAdvance, "id" | "enteredBy">) => Promise<void> }) {
  const [employeeId, setEmployeeId] = useState(""); const [date, setDate] = useState(today()); const [amount, setAmount] = useState(""); const [type, setType] = useState("Regular 25th"); const [note, setNote] = useState("");
  const employee = employees.find((row) => row.id === employeeId); const currentSalary = employee?.settings.toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.monthlySalary ?? 0;
  const warning = type === "Regular 25th" && Number(amount) > currentSalary * maxPercent / 100;
  useEffect(() => { if (open) { setEmployeeId(""); setDate(today()); setAmount(""); setType("Regular 25th"); setNote(""); } }, [open]);
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Add salary advance</DialogTitle></DialogHeader><div className="space-y-3"><div className="space-y-1"><Label>Employee</Label><Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger><SelectContent>{employees.filter((row) => row.isActive).map((row) => <SelectItem key={row.id} value={row.id}>{row.name} · {row.machineNo}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><Field label="Date" type="date" value={date} onChange={setDate} /><Field label="Amount (₹)" type="number" value={amount} onChange={setAmount} /></div><div className="space-y-1"><Label>Type</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Regular 25th">Regular 25th</SelectItem><SelectItem value="Emergency">Emergency</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select></div><Field label="Month to deduct from" type="month" value={month} onChange={() => undefined} disabled /><div className="space-y-1"><Label>Note</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></div>{warning && <p className="text-sm text-amber-700">This regular advance exceeds {maxPercent}% of the employee’s monthly salary. It can still be saved.</p>}</div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || !employeeId || Number(amount) <= 0} onClick={() => { if (!employeeId) return; void onSave({ employeeId, date, amount: Number(amount), type, note, monthToDeductFrom: month }); }}>Add advance</Button></DialogFooter></DialogContent></Dialog>;
}

function HolidayDialog({ open, saving, onClose, onSave }: { open: boolean; saving: boolean; onClose: () => void; onSave: (holiday: { date: string; name: string; isRecurringSunday: boolean }) => Promise<void> }) {
  const [date, setDate] = useState(""); const [name, setName] = useState("");
  useEffect(() => { if (open) { setDate(""); setName(""); } }, [open]);
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Add holiday</DialogTitle><DialogDescription>Use the actual date for holidays that change each year.</DialogDescription></DialogHeader><div className="space-y-3"><Field label="Date" type="date" value={date} onChange={setDate} required /><Field label="Holiday name" value={name} onChange={setName} required /></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || !date || !name.trim()} onClick={() => void onSave({ date, name: name.trim(), isRecurringSunday: false })}>Save holiday</Button></DialogFooter></DialogContent></Dialog>;
}