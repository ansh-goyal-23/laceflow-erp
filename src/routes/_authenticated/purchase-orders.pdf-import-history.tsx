import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { deletePdfImport, listPdfImports, type PdfImportRow } from "@/lib/pdf-import";
import { PdfImportGuard } from "@/components/pdf-import-guard";

export const Route = createFileRoute("/_authenticated/purchase-orders/pdf-import-history")({
  component: () => (
    <PdfImportGuard>
      <PdfImportHistoryPage />
    </PdfImportGuard>
  ),
});

function PdfImportHistoryPage() {
  const [rows, setRows] = useState<PdfImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const clients = useStore((s) => s.clients);

  const reload = () => {
    setLoading(true);
    listPdfImports()
      .then(setRows)
      .catch((e) => toast.error((e as Error).message ?? "Failed to load"))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.name ?? "—" : "—";

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="PDF Import History"
        subtitle="All PDF Purchase Orders processed by AI"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/purchase-orders">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <Button asChild>
              <Link to="/purchase-orders/import-pdf">
                <Upload className="h-4 w-4 mr-1" /> Import PDF PO
              </Link>
            </Button>
          </div>
        }
      />
      <Card className="p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Upload Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Imported By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No PDF imports yet
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{clientName(r.client_id)}</TableCell>
                    <TableCell className="font-medium">{r.po_number ?? "—"}</TableCell>
                    <TableCell className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.file_name}
                    </TableCell>
                    <TableCell>{r.uploaded_by_email ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          r.status === "saved"
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (!confirm("Delete this PDF import record and file?")) return;
                          try {
                            await deletePdfImport(r);
                            reload();
                          } catch (e) {
                            toast.error((e as Error).message ?? "Failed to delete");
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}