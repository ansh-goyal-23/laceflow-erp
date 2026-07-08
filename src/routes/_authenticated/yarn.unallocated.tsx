import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { useYarnStore, inwardItemUnallocatedQty } from "@/lib/yarn-store";

export const Route = createFileRoute("/_authenticated/yarn/unallocated")({
  component: UnallocatedYarn,
});

function UnallocatedYarn() {
  const inwards = useYarnStore((s) => s.inwards);
  const suppliers = useYarnStore((s) => s.suppliers);
  const [q, setQ] = useState("");
  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const rows = useMemo(() => {
    const out: Array<{
      key: string; supplierName: string; supplierShadeNumber: string; lotNumber?: string;
      available: number; inwardNumber: string; inwardDate: string;
    }> = [];
    for (const inw of inwards) {
      for (const it of inw.items) {
        const avail = inwardItemUnallocatedQty(it);
        if (avail <= 0.0001) continue;
        out.push({
          key: it.id, supplierName: sName(inw.supplierId),
          supplierShadeNumber: it.supplierShadeNumber, lotNumber: it.lotNumber,
          available: avail, inwardNumber: inw.number, inwardDate: inw.inwardDate,
        });
      }
    }
    return out;
  }, [inwards, suppliers]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) =>
      r.supplierName.toLowerCase().includes(query) ||
      r.supplierShadeNumber.toLowerCase().includes(query) ||
      (r.lotNumber || "").toLowerCase().includes(query) ||
      r.inwardNumber.toLowerCase().includes(query),
    );
  }, [rows, q]);

  const total = filtered.reduce((s, r) => s + r.available, 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Unallocated Yarn"
        subtitle="Received net yarn not yet allocated to any Production Yarn Order"
      />
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search supplier, shade, lot, inward…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">Total: <span className="font-medium text-foreground">{total.toFixed(2)} Kg</span></div>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Supplier</TableHead><TableHead>Shade #</TableHead><TableHead>Lot #</TableHead>
              <TableHead>Available Qty (Kg)</TableHead>
              <TableHead>Inward #</TableHead><TableHead>Inward Date</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No unallocated yarn.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.supplierName}</TableCell>
                  <TableCell className="font-mono text-xs">{r.supplierShadeNumber}</TableCell>
                  <TableCell>{r.lotNumber || "—"}</TableCell>
                  <TableCell className="font-medium">{r.available.toFixed(2)}</TableCell>
                  <TableCell className="font-mono">{r.inwardNumber}</TableCell>
                  <TableCell>{r.inwardDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}