import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import {
  useYarnStore, yarnStore, inwardItemUnallocatedQty,
  type PendingProdRow,
} from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/pending-allocations")({
  component: PendingAllocations,
});

interface PendingAllocRow {
  inwardItemId: string;
  inwardId: string;
  inwardNumber: string;
  inwardDate: string;
  supplierId: string;
  supplierName: string;
  supplierShadeNumber: string;
  lotNumber?: string;
  netWeight: number;
  unallocated: number;
  hasMatches: boolean;
}

function PendingAllocations() {
  const inwards = useYarnStore((s) => s.inwards);
  const productionOrders = useYarnStore((s) => s.productionOrders);
  const suppliers = useYarnStore((s) => s.suppliers);
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);
  const [q, setQ] = useState("");

  const [dialog, setDialog] = useState<
    | { open: false }
    | { open: true; row: PendingAllocRow; pendingRows: PendingProdRow[]; alloc: Record<string, string> }
  >({ open: false });

  const rows: PendingAllocRow[] = useMemo(() => {
    const list: PendingAllocRow[] = [];
    for (const inw of inwards) {
      const supplierName = suppliers.find((s) => s.id === inw.supplierId)?.name ?? "—";
      for (const it of inw.items) {
        const unalloc = inwardItemUnallocatedQty(it);
        if (unalloc <= 0.0001) continue;
        const key = it.supplierShadeNumber.trim().toLowerCase();
        const hasMatches = productionOrders.some((po) =>
          po.supplierId === inw.supplierId && po.status !== "cancelled" &&
          po.items.some((pi) =>
            (pi.supplierShadeNumber || "").trim().toLowerCase() === key &&
            pi.orderedQty - pi.receivedQty > 0.0001,
          ),
        );
        list.push({
          inwardItemId: it.id, inwardId: inw.id, inwardNumber: inw.number,
          inwardDate: inw.inwardDate, supplierId: inw.supplierId, supplierName,
          supplierShadeNumber: it.supplierShadeNumber,
          lotNumber: it.lotNumber,
          netWeight: it.netWeight, unallocated: unalloc, hasMatches,
        });
      }
    }
    return list;
  }, [inwards, productionOrders, suppliers]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) =>
      r.supplierName.toLowerCase().includes(query) ||
      r.inwardNumber.toLowerCase().includes(query) ||
      r.supplierShadeNumber.toLowerCase().includes(query) ||
      (r.lotNumber || "").toLowerCase().includes(query),
    );
  }, [rows, q]);

  const poNum = (id: string) => pos.find((p) => p.id === id)?.poNumber ?? "—";
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const allocate = async (row: PendingAllocRow) => {
    try {
      const res = await yarnStore.allocateInwardItemAuto(row.inwardItemId);
      if (res.done) { toast.success("Fully allocated"); return; }
      setDialog({
        open: true, row,
        pendingRows: res.pendingRows,
        alloc: Object.fromEntries(res.pendingRows.map((r) => [r.prodOrderItemId, ""])),
      });
    } catch (e) { toast.error((e as Error).message); }
  };

  const commitDialog = async () => {
    if (!dialog.open) return;
    const allocations = dialog.pendingRows.map((r) => ({
      prodOrderItemId: r.prodOrderItemId,
      qty: Number(dialog.alloc[r.prodOrderItemId] || 0),
    }));
    for (const a of allocations) {
      const row = dialog.pendingRows.find((r) => r.prodOrderItemId === a.prodOrderItemId)!;
      if (a.qty < 0) { toast.error("Negative not allowed"); return; }
      if (a.qty > row.pending + 0.0001) { toast.error(`Exceeds pending for ${cName(row.clientId)} ${row.colorName}`); return; }
    }
    const sum = allocations.reduce((s, a) => s + a.qty, 0);
    if (Math.abs(sum - dialog.row.unallocated) > 0.0001) {
      toast.error(`Total allocated (${sum.toFixed(2)}) must equal Net remaining (${dialog.row.unallocated.toFixed(2)})`);
      return;
    }
    try {
      await yarnStore.allocateInwardItemManual(dialog.row.inwardItemId, allocations);
      toast.success("Allocations saved");
      setDialog({ open: false });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Pending Yarn Allocation"
        subtitle="Procurement: allocate received yarn to Production Yarn Orders"
      />
      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search supplier, inward #, shade, lot…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Supplier</TableHead><TableHead>Inward #</TableHead><TableHead>Date</TableHead>
              <TableHead>Shade #</TableHead><TableHead>Lot #</TableHead>
              <TableHead>Net (Kg)</TableHead><TableHead>Unallocated (Kg)</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-[120px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nothing pending. All received yarn is allocated.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.inwardItemId}>
                  <TableCell>{r.supplierName}</TableCell>
                  <TableCell className="font-mono">{r.inwardNumber}</TableCell>
                  <TableCell>{r.inwardDate}</TableCell>
                  <TableCell className="font-mono text-xs">{r.supplierShadeNumber}</TableCell>
                  <TableCell>{r.lotNumber || "—"}</TableCell>
                  <TableCell>{r.netWeight.toFixed(2)}</TableCell>
                  <TableCell className="font-medium">{r.unallocated.toFixed(2)}</TableCell>
                  <TableCell>
                    {r.hasMatches
                      ? <Badge variant="secondary">Ready</Badge>
                      : <Badge className="bg-muted text-muted-foreground">No matching PO</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => allocate(r)} disabled={!r.hasMatches}>Allocate</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialog.open} onOpenChange={(o) => !o && setDialog({ open: false })}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>Allocate Received Yarn</DialogTitle></DialogHeader>
          {dialog.open && (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Net remaining {dialog.row.unallocated.toFixed(2)} Kg is less than total pending.
                Distribute across the matching production yarn orders — allocations must total exactly the remaining net.
              </p>
              <div className="rounded-md border max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background"><TableRow>
                    <TableHead>Client</TableHead><TableHead>PO #</TableHead>
                    <TableHead>Material</TableHead><TableHead>Color</TableHead>
                    <TableHead>Ordered</TableHead><TableHead>Already Allocated</TableHead>
                    <TableHead>Pending</TableHead><TableHead>Allocate</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {dialog.pendingRows.map((r) => (
                      <TableRow key={r.prodOrderItemId}>
                        <TableCell>{cName(r.clientId)}</TableCell>
                        <TableCell className="font-mono">{poNum(r.poId)}</TableCell>
                        <TableCell>{r.material}</TableCell>
                        <TableCell>{r.colorName}</TableCell>
                        <TableCell>{r.orderedQty.toFixed(2)}</TableCell>
                        <TableCell>{r.receivedQty.toFixed(2)}</TableCell>
                        <TableCell>{r.pending.toFixed(2)}</TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={dialog.alloc[r.prodOrderItemId]} onChange={(e) => setDialog({
                            ...dialog,
                            alloc: { ...dialog.alloc, [r.prodOrderItemId]: e.target.value },
                          })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-sm mt-2">
                Allocated: {Object.values(dialog.alloc).reduce((s, v) => s + (Number(v) || 0), 0).toFixed(2)} / {dialog.row.unallocated.toFixed(2)} Kg
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={commitDialog}>Save Allocations</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}