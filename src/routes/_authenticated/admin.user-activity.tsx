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
import { Download, FileSpreadsheet } from "lucide-react";
import { fetchAuditUsers, fetchUserActivity, type UserActivityRow } from "@/lib/audit";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/user-activity")({
  component: () => (
    <AdminGuard>
      <UserActivityPage />
    </AdminGuard>
  ),
});

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function UserActivityPage() {
  const initial = useMemo(defaultRange, []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [userId, setUserId] = useState<string>("all");
  const [users, setUsers] = useState<{ user_id: string; user_name: string }[]>([]);
  const [rows, setRows] = useState<UserActivityRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetchAuditUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchUserActivity(from, to, userId === "all" ? null : userId)
      .then(setRows)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [from, to, userId]);

  const exportRows = (kind: "csv" | "xlsx") => {
    const headers = ["User", "Records Created", "Records Edited", "Records Deleted", "Imports", "Logins", "Last Activity"];
    const data = rows.map((r) => [
      r.user_name,
      r.created,
      r.edited,
      r.deleted,
      r.imports,
      r.logins,
      r.last_activity ? new Date(r.last_activity).toLocaleString() : "",
    ]);
    const name = `user-activity-${from}_${to}`;
    if (kind === "csv") exportCSV(`${name}.csv`, headers, data);
    else exportXLSX(`${name}.xlsx`, "User Activity", headers, data);
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="User Activity"
        subtitle="Productivity per user, aggregated from the audit log."
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
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">User</label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.user_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="text-right">Edited</TableHead>
                  <TableHead className="text-right">Deleted</TableHead>
                  <TableHead className="text-right">Imports</TableHead>
                  <TableHead className="text-right">Logins</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
                )}
                {!loading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No activity in this range.</TableCell></TableRow>
                )}
                {!loading && rows.map((r) => (
                  <TableRow key={r.user_id ?? r.user_name}>
                    <TableCell className="font-medium">{r.user_name}</TableCell>
                    <TableCell className="text-right">{r.created}</TableCell>
                    <TableCell className="text-right">{r.edited}</TableCell>
                    <TableCell className="text-right">{r.deleted}</TableCell>
                    <TableCell className="text-right">{r.imports}</TableCell>
                    <TableCell className="text-right">{r.logins}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.last_activity ? new Date(r.last_activity).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}