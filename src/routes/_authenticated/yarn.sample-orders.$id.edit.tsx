import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Lock } from "lucide-react";
import { useYarnStore, yarnStore, sampleExpectedDelivery, type SampleOrderStatus } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/sample-orders/$id/edit")({
  component: EditSampleOrder,
});

interface Row {
  id?: string;
  clientId: string; brandId: string; colorName: string; material: string;
  approxQty: string; pantone: string; remarks: string;
  locked: boolean; lockReason: string;
}

function EditSampleOrder() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const order = useYarnStore((s) => s.sampleOrders.find((o) => o.id === id));
  const suppliers = useYarnStore((s) => s.suppliers);
  const clients = useStore((s) => s.clients);
  const brands = useStore((s) => s.brands);
  const pos = useStore((s) => s.purchaseOrders);

  const initial = useMemo(() => {
    if (!order) return null;
    const received = new Set(order.receipts.map((r) => r.sampleOrderItemId).filter(Boolean) as string[]);
    return {
      rows: order.items.map<Row>((i) => ({
        id: i.id,
        clientId: i.clientId, brandId: i.brandId,
        colorName: i.colorName, material: i.material,
        approxQty: String(i.approxQty), pantone: i.pantone ?? "", remarks: i.remarks ?? "",
        locked: i.approvalStatus === "approved" || received.has(i.id),
        lockReason: i.approvalStatus === "approved" ? "Approved" : "Yarn received",
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const [supplierId, setSupplierId] = useState(order?.supplierId ?? "");
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [linkedPoId, setLinkedPoId] = useState(order?.linkedPoId ?? "");
  const [status, setStatus] = useState<SampleOrderStatus>(order?.status ?? "ordered");
  const [remarks, setRemarks] = useState(order?.remarks ?? "");
  const [rows, setRows] = useState<Row[]>(initial?.rows ?? []);
  const [saving, setSaving] = useState(false);

  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!order || !initial) return;
    if (loadedId.current === order.id) return;
    loadedId.current = order.id;
    setSupplierId(order.supplierId);
    setOrderDate(order.orderDate);
    setLinkedPoId(order.linkedPoId ?? "");
    setStatus(order.status);
    setRemarks(order.remarks ?? "");
    setRows(initial.rows);
  }, [order, initial]);

  if (!order || !initial) {
    return <div className="p-6 text-sm text-muted-foreground">Not found. <button onClick={() => nav({ to: "/yarn/sample-orders" })} className="underline">Back</button></div>;
  }

  const anyLocked = rows.some((r) => r.locked);
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const addRow = () => setRows((rs) => [...rs, {
    clientId: "", brandId: "", colorName: "", material: "",
    approxQty: "", pantone: "", remarks: "", locked: false, lockReason: "",
  }]);

  const save = async () => {
    if (saving) return;
    if (!supplierId) { toast.error("Select supplier"); return; }
    const cleaned = rows.filter((r) => r.clientId && r.brandId && r.colorName.trim() && r.material.trim());
    if (!cleaned.length) { toast.error("Keep at least one valid item"); return; }
    setSaving(true);
    try {
      await yarnStore.updateSampleOrderFull(order.id, {
        orderDate, supplierId, linkedPoId: linkedPoId || null,
        remarks: remarks.trim(), status,
        items: cleaned.map((r) => ({
          id: r.id,
          clientId: r.clientId, brandId: r.brandId,
          colorName: r.colorName.trim(), material: r.material.trim(),
          approxQty: Number(r.approxQty) || 0,
          pantone: r.pantone.trim() || undefined,
          remarks: r.remarks.trim() || undefined,
        })),
      });
      toast.success("Sample order updated");
      nav({ to: "/yarn/sample-orders/$id", params: { id: order.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-4">
      <PageHeader title={`Edit Sample Yarn Order ${order.number}`} subtitle="Approved or received colors stay locked" />

      <Card className="p-4 grid md:grid-cols-4 gap-3">
        <div><Label>Order Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
        <div><Label>Expected Delivery</Label><Input value={sampleExpectedDelivery(orderDate)} readOnly className="bg-muted" /></div>
        <div>
          <Label>Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId} disabled={anyLocked}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Linked Production PO</Label>
          <Select value={linkedPoId || "none"} onValueChange={(v) => setLinkedPoId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as SampleOrderStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3"><Label>Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Sample Items</h3>
          <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>Brand</TableHead><TableHead>Color</TableHead>
              <TableHead>Material</TableHead><TableHead>Approx Qty (Kg)</TableHead>
              <TableHead>Pantone</TableHead><TableHead>Remarks</TableHead><TableHead className="w-[40px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id ?? `new-${i}`}>
                  <TableCell>
                    <Select value={r.clientId} onValueChange={(v) => patch(i, { clientId: v })} disabled={r.locked}>
                      <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
                      <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={r.brandId} onValueChange={(v) => patch(i, { brandId: v })} disabled={r.locked}>
                      <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
                      <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {r.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                      <Input value={r.colorName} disabled={r.locked} onChange={(e) => patch(i, { colorName: e.target.value })} />
                    </div>
                  </TableCell>
                  <TableCell><Input value={r.material} disabled={r.locked} onChange={(e) => patch(i, { material: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" step="0.01" value={r.approxQty} onChange={(e) => patch(i, { approxQty: e.target.value })} /></TableCell>
                  <TableCell><Input value={r.pantone} onChange={(e) => patch(i, { pantone: e.target.value })} /></TableCell>
                  <TableCell><Input value={r.remarks} onChange={(e) => patch(i, { remarks: e.target.value })} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" disabled={r.locked}
                      title={r.locked ? `${r.lockReason} — cannot delete` : "Delete item"}
                      onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/sample-orders/$id", params: { id: order.id } })}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </div>
    </div>
  );
}