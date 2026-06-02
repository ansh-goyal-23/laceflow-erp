import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Upload } from "lucide-react";
import { bulkImport } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchase-orders/import-history")({
  component: ImportHistoryPage,
});

interface HistoryRow {
  id: string;
  file_name: string;
  uploaded_by_email: string | null;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  status: string;
  created_at: string;
}

function ImportHistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bulkImport
      .fetchImportHistory()
      .then((data) => setRows(data as HistoryRow[]))
      .catch((e) => toast.error((e as Error).message ?? "Failed to load history"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Import History"
        subtitle="All Excel imports performed for purchase orders"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/purchase-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
            <Button asChild>
              <Link to="/purchase-orders/import"><Upload className="h-4 w-4 mr-1" /> New Import</Link>
            </Button>
          </div>
        }
      />
      <Card className="p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Successful</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No imports yet</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.file_name}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>{r.uploaded_by_email ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.total_rows}</TableCell>
                  <TableCell className="text-right text-primary">{r.successful_rows}</TableCell>
                  <TableCell className="text-right text-destructive">{r.failed_rows}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      r.status === "completed" ? "bg-primary/10 text-primary" : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                    }`}>{r.status.replace(/_/g, " ")}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}