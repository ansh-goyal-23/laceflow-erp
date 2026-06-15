import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AdminGuard } from "@/components/admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, FileSpreadsheet } from "lucide-react";
import { fetchDailyReport, type DailyReportUser, type AuditAction } from "@/lib/audit";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/daily-report")({
  component: () => (
    <AdminGuard>
      <DailyReportPage />
    </AdminGuard>
  ),
});

const ACTIONS: AuditAction[] = ["CREATE", "EDIT", "DELETE", "IMPORT", "LOGIN", "LOGOUT"];

function DailyReportPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [users, setUsers] = useState<DailyReportUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchDailyReport(date)
      .then(setUsers)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, [date]);

  const exportRows = (kind: "csv" | "xlsx") => {
    const headers = ["User", "Module", "Action", "Count"];
    const data: (string | number)[][] = [];
    for (const u of users) {
      for (const [module, actions] of Object.entries(u.breakdown)) {
        for (const a of ACTIONS) {
          const count = actions[a] ?? 0;
          if (count) data.push([u.user_name, module, a, count]);
        }
      }
      data.push([u.user_name, "TOTAL", "", u.total]);
    }
    const name = `daily-work-report-${date}`;
    if (kind === "csv") exportCSV(`${name}.csv`, headers, data);
    else exportXLSX(`${name}.xlsx`, "Daily Report", headers, data);
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Daily Work Report"
        subtitle="Computed live from the audit log — no daily snapshots stored."
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
        <CardContent className="pt-6 flex items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && users.length === 0 && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">No activity recorded on {date}.</CardContent></Card>
      )}

      <div className="space-y-4">
        {users.map((u) => (
          <Card key={u.user_id ?? u.user_name}>
            <CardContent className="pt-6">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-lg">{u.user_name}</h3>
                <span className="text-sm text-muted-foreground">Total: <span className="font-medium text-foreground">{u.total}</span></span>
              </div>
              <div className="space-y-1 text-sm">
                {Object.entries(u.breakdown).map(([module, actions]) => (
                  <div key={module} className="flex flex-wrap gap-2 items-center">
                    <span className="font-medium min-w-[160px]">{module}</span>
                    {ACTIONS.map((a) => {
                      const c = actions[a] ?? 0;
                      if (!c) return null;
                      return (
                        <span key={a} className="px-2 py-0.5 rounded bg-muted text-muted-foreground text-xs">
                          {a}: <span className="text-foreground font-medium">{c}</span>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}