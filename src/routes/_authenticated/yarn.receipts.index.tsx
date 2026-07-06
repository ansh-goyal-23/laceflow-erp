import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/receipts/")({
  component: ReceiptsList,
});

function ReceiptsList() {
  const receipts = useYarnStore((s) => s.receipts);
  const suppliers = useYarnStore((s) => s.suppliers);
  const [q, setQ] = useState("");
  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return receipts;
    return receipts.filter((r) =>
      sName(r.supplierId).toLowerCase().includes(query) ||
      r.supplierShadeNumber.toLowerCase().includes(query) ||
      (r.lotNumber || "").toLowerCase().includes(query),
    );
  }, [receipts, q, suppliers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Yarn Receipts"
        actions={<Button asChild><Link to="/yarn/receipts/new"><Plus className="h-4 w-4 mr-1" /> New Receipt</Link></Button>}
      />
      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search supplier, shade #, lot…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Shade #</TableHead><TableHead>Lot #</TableHead>
              <TableHead>Gross (Kg)</TableHead><TableHead>Cones</TableHead>
              <TableHead>Allocated</TableHead><TableHead>Unallocated</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No receipts.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const allocated = r.allocations.reduce((s, a) => s + a.qty, 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{r.receiptDate}</TableCell>
                    <TableCell>{sName(r.supplierId)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.supplierShadeNumber}</TableCell>
                    <TableCell>{r.lotNumber || "—"}</TableCell>
                    <TableCell>{r.grossWeight}</TableCell>
                    <TableCell>{r.cones}</TableCell>
                    <TableCell>{allocated.toFixed(2)}</TableCell>
                    <TableCell className="font-medium">{r.unallocatedQty.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => {
                        if (confirm("Delete this receipt? Allocations will be reversed.")) {
                          yarnStore.deleteReceipt(r.id); toast.success("Deleted");
                        }
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
