import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useYarnStore, yarnStore, type PendingProdRow } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/receipts/new")({
  component: NewReceipt,
});

interface Draft {
  receiptDate: string;
  supplierId: string;
  supplierShadeNumber: string;
  lotNumber: string;
  grossWeight: string;
  cones: string;
  remarks: string;
}

function NewReceipt() {
  const nav = useNavigate();
  const suppliers = useYarnStore((s) => s.suppliers);
  const pos = useStore((s) => s.purchaseOrders);
  const clients = useStore((s) => s.clients);
  const [d, setD] = useState<Draft>({
    receiptDate: new Date().toISOString().slice(0, 10),
    supplierId: "", supplierShadeNumber: "",
    lotNumber: "", grossWeight: "", cones: "", remarks: "",
  });
  const [manual, setManual] = useState<{ rows: PendingProdRow[]; alloc: Record<string, string> } | null>(null);

  const poNum = (id: string) => pos.find((p) => p.id === id)?.poNumber ?? "—";
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const submit = async () => {
    if (!d.supplierId || !d.supplierShadeNumber.trim() || !d.grossWeight) { toast.error("Fill supplier, shade # and gross weight"); return; }
    const payload = {
      receiptDate: d.receiptDate,
      supplierId: d.supplierId,
      supplierShadeNumber: d.supplierShadeNumber.trim(),
      lotNumber: d.lotNumber || undefined,
      grossWeight: Number(d.grossWeight) || 0,
      cones: Number(d.cones) || 0,
      remarks: d.remarks || undefined,
    };
    try {
      const res = await yarnStore.planYarnReceipt(payload);
      if (!res.needsManual) {
        toast.success("Receipt saved & allocated");
        nav({ to: "/yarn/receipts" });
        return;
      }
      setManual({
        rows: res.pendingRows,
        alloc: Object.fromEntries(res.pendingRows.map((r) => [r.prodOrderItemId, ""])),
      });
    } catch (e) { toast.error((e as Error).message); }
  };

  const commitManual = async () => {
    if (!manual) return;
    const allocations = manual.rows.map((r) => ({
      prodOrderItemId: r.prodOrderItemId,
      qty: Number(manual.alloc[r.prodOrderItemId] || 0),
    }));
    for (const a of allocations) {
      const row = manual.rows.find((r) => r.prodOrderItemId === a.prodOrderItemId)!;
      if (a.qty < 0) { toast.error("Negative not allowed"); return; }
      if (a.qty > row.pending + 0.0001) { toast.error(`Allocation exceeds pending for ${cName(row.clientId)} ${row.colorName}`); return; }
    }
    const sum = allocations.reduce((s, a) => s + a.qty, 0);
    if (Math.abs(sum - Number(d.grossWeight)) > 0.0001) {
      toast.error(`Total allocated (${sum.toFixed(2)}) must equal received (${Number(d.grossWeight).toFixed(2)})`); return;
    }
    try {
      await yarnStore.commitYarnReceipt({
        receiptDate: d.receiptDate,
        supplierId: d.supplierId,
        supplierShadeNumber: d.supplierShadeNumber.trim(),
        lotNumber: d.lotNumber || undefined,
        grossWeight: Number(d.grossWeight) || 0,
        cones: Number(d.cones) || 0,
        remarks: d.remarks || undefined,
        allocations,
      });
      toast.success("Receipt saved with allocations");
      setManual(null);
      nav({ to: "/yarn/receipts" });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-4">
      <PageHeader title="New Yarn Receipt" subtitle="Auto-allocates when possible; opens allocation grid when partial." />
      <Card className="p-4 grid md:grid-cols-3 gap-3">
        <div><Label>Receipt Date</Label><Input type="date" value={d.receiptDate} onChange={(e) => setD({ ...d, receiptDate: e.target.value })} /></div>
        <div><Label>Supplier *</Label>
          <Select value={d.supplierId} onValueChange={(v) => setD({ ...d, supplierId: v })}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Supplier Shade # *</Label><Input value={d.supplierShadeNumber} onChange={(e) => setD({ ...d, supplierShadeNumber: e.target.value })} /></div>
        <div><Label>Lot #</Label><Input value={d.lotNumber} onChange={(e) => setD({ ...d, lotNumber: e.target.value })} /></div>
        <div><Label>Gross Weight (Kg) *</Label><Input type="number" step="0.01" value={d.grossWeight} onChange={(e) => setD({ ...d, grossWeight: e.target.value })} /></div>
        <div><Label>Number of Cones</Label><Input type="number" value={d.cones} onChange={(e) => setD({ ...d, cones: e.target.value })} /></div>
        <div className="md:col-span-3"><Label>Remarks</Label><Textarea rows={2} value={d.remarks} onChange={(e) => setD({ ...d, remarks: e.target.value })} /></div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/receipts" })}>Cancel</Button>
        <Button onClick={submit}>Save Receipt</Button>
      </div>

      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Allocate Received Qty</DialogTitle>
          </DialogHeader>
          {manual && (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Received {Number(d.grossWeight).toFixed(2)} Kg is less than total pending. Allocate to production orders below (must total exactly the received qty).
              </p>
              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background"><TableRow>
                    <TableHead>Client</TableHead><TableHead>PO</TableHead><TableHead>Material</TableHead>
                    <TableHead>Color</TableHead><TableHead>Ordered</TableHead>
                    <TableHead>Received</TableHead><TableHead>Pending</TableHead>
                    <TableHead>Allocate</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {manual.rows.map((r) => (
                      <TableRow key={r.prodOrderItemId}>
                        <TableCell>{cName(r.clientId)}</TableCell>
                        <TableCell className="font-mono">{poNum(r.poId)}</TableCell>
                        <TableCell>{r.material}</TableCell>
                        <TableCell>{r.colorName}</TableCell>
                        <TableCell>{r.orderedQty}</TableCell>
                        <TableCell>{r.receivedQty}</TableCell>
                        <TableCell>{r.pending.toFixed(2)}</TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={manual.alloc[r.prodOrderItemId]} onChange={(e) => setManual({ ...manual, alloc: { ...manual.alloc, [r.prodOrderItemId]: e.target.value } })} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-sm mt-2">
                Allocated: {Object.values(manual.alloc).reduce((s, v) => s + (Number(v) || 0), 0).toFixed(2)} / {Number(d.grossWeight).toFixed(2)} Kg
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setManual(null)}>Cancel</Button>
            <Button onClick={commitManual}>Save Allocations</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
