import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AdminGuard } from "@/components/admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAuditLogs, fetchAuditUsers, type AuditAction, type AuditLogRow } from "@/lib/audit";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  component: () => (
    <AdminGuard>
      <AuditLogsPage />
    </AdminGuard>
  ),
});

const MODULES = [
  "Brands",
  "Clients",
  "Purchase Orders",
  "PO Imports",
  "PDF PO Imports",
  "Dispatches",
  "Invoices",
  "AI Learning",
  "User Management",
  "Auth",
];
const ACTIONS: AuditAction[] = ["CREATE", "EDIT", "DELETE", "IMPORT", "LOGIN", "LOGOUT"];
const PAGE_SIZE = 50;

function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string>("all");
  const [moduleF, setModuleF] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [users, setUsers] = useState<{ user_id: string; user_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchAuditUsers().then(setUsers).catch(() => {});
  }, []);

  const load = useMemo(
    () => async (p: number) => {
      setLoading(true);
      try {
        const { rows, total } = await fetchAuditLogs({
          search: search.trim() || undefined,
          userId: userId === "all" ? null : userId,
          module: moduleF === "all" ? null : moduleF,
          action: action === "all" ? null : (action as AuditAction),
          from: from || null,
          to: to || null,
          limit: PAGE_SIZE,
          offset: p * PAGE_SIZE,
        });
        setRows(rows);
        setTotal(total);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [search, userId, moduleF, action, from, to],
  );

  useEffect(() => {
    setPage(0);
    void load(0);
  }, [load]);

  const exportRows = async (kind: "csv" | "xlsx") => {
    try {
      const { rows } = await fetchAuditLogs({
        search: search.trim() || undefined,
        userId: userId === "all" ? null : userId,
        module: moduleF === "all" ? null : moduleF,
        action: action === "all" ? null : (action as AuditAction),
        from: from || null,
        to: to || null,
        limit: 10000,
        offset: 0,
      });
      const headers = ["Date & Time", "User", "Module", "Action", "Record Type", "Record Identifier"];
      const data = rows.map((r) => [
        new Date(r.created_at).toLocaleString(),
        r.user_name,
        r.module,
        r.action,
        r.record_type ?? "",
        r.record_id ?? "",
      ]);
      const name = `audit-logs-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "csv") exportCSV(`${name}.csv`, headers, data);
      else exportXLSX(`${name}.xlsx`, "Audit Logs", headers, data);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Audit Logs"
        subtitle="Append-only activity log. Stores only timestamp, user, module, action and record identifier."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportRows("csv")}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportRows("xlsx")}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-6 gap-3">
          <Input
            placeholder="Search user / record…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:col-span-2"
          />
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger><SelectValue placeholder="User" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.user_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={moduleF} onValueChange={setModuleF}>
            <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2 md:col-span-6">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record Type</TableHead>
                  <TableHead>Record Identifier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No activity matches these filters.</TableCell></TableRow>
                )}
                {!loading && rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{r.user_name}</TableCell>
                    <TableCell>{r.module}</TableCell>
                    <TableCell>{r.action}</TableCell>
                    <TableCell>{r.record_type ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.record_id ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm">
            <div className="text-muted-foreground">
              {total.toLocaleString()} {total === 1 ? "entry" : "entries"} · page {page + 1} / {pages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => { const p = page - 1; setPage(p); void load(p); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages || loading} onClick={() => { const p = page + 1; setPage(p); void load(p); }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}