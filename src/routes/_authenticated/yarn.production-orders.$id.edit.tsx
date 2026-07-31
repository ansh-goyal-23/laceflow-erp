import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Lock, Search } from "lucide-react";
import {
  useYarnStore, yarnStore, expandPoColors, type ProductionOrderStatus,
} from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/production-orders/$id/edit")({
  component: EditProductionOrder,
});

interface Row {
  id?: string;
  poId: string; poItemId?: string | null;
  clientId: string; brandId: string;
  colorName: string; material: string;
  orderedQty: string;
  approvedShadeId: string;
  supplierShadeNumber: string;
  receivedQty: number;
}

function EditProductionOrder() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const order = useYarnStore((s) => s.productionOrders.find((o) => o.id === id));
  const suppliers = useYarnStore((s) => s.suppliers);
  const shades = useYarnStore((s) => s.shades);
  const pos = useStore((s) => s.purchaseOrders);

  const initialRows = useMemo<Row[]>(() => (order?.items ?? []).map((i) => ({
    id: i.id, poId: i.poId, poItemId: i.poItemId ?? null,
    clientId: i.clientId, brandId: i.brandId,
    colorName: i.colorName, material: i.material,
    orderedQty: String(i.orderedQty),
    approvedShadeId: i.approvedShadeId ?? "",
    supplierShadeNumber: i.supplierShadeNumber ?? "",
    receivedQty: i.receivedQty,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [order?.id]);

  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? "");
  const [status, setStatus] = useState<ProductionOrderStatus>(order?.status ?? "ordered");
  const [remarks, setRemarks] = useState(order?.remarks ?? "");
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [saving, setSaving] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [poQuery, setPoQuery] = useState("");
  const [pickedPoId, setPickedPoId] = useState<string | null>(null);

  const poList = useMemo(() => {
    const q = poQuery.trim().toLowerCase();
    const list = pos.filter((p) => p.status !== "draft");
    if (!q) return list.slice(0, 50);
    return list.filter((p) => p.poNumber.toLowerCase().includes(q)).slice(0, 50);
  }, [pos, poQuery]);

  if (!order) {
    return <div className="p-6 text-sm text-muted-foreground">Not found. <button onClick={() => nav({ to: "/yarn/production-orders" })} className="underline">Back</button></div>;
  }

  const anyReceived = rows.some((r) => r.receivedQty > 0.0001);
  const poNumber = (poId: string) => pos.find((p) => p.id === poId)?.poNumber ?? "—";
  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const pickedPo = pickedPoId ? pos.find((p) => p.id === pickedPoId) : undefined;
  const pickedColors = useMemo(() => {
    if (!pickedPo) return [] as Array<{ key: string; name: string; material: string; poItemId: string }>;
    const out: Array<{ key: string; name: string; material: string; poItemId: string }> = [];
    const seen = new Set<string>();
    for (const it of pickedPo.items) {
      for (const c of expandPoColors(it.color)) {
        const key = `${c.name}|${it.materialType}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, name: c.name, material: it.materialType, poItemId: it.id });
      }
    }
    return out;
  }, [pickedPo]);

  const addLine = (c: { name: string; material: string; poItemId: string }) => {
    if (!pickedPo) return;
    setRows((rs) => [...rs, {
      poId: pickedPo.id, poItemId: c.poItemId,
      clientId: pickedPo.clientId, brandId: pickedPo.brandId,
      colorName: c.name, material: c.material,
      orderedQty: "", approvedShadeId: "", supplierShadeNumber: "", receivedQty: 0,
    }]);
    toast.success(`${c.name} added`);
  };

  const save = async () => {
    if (saving) return;
    if (!supplierId) { toast.error("Select supplier"); return; }
    const cleaned = rows.filter((r) => r.colorName.trim() && r.poId);
    if (!cleaned.length) { toast.error("Keep at least one procurement line"); return; }
    setSaving(true);
    try {
      await yarnStore.updateProductionOrderFull(order.id, {
        orderDate, supplierId, remarks: remarks.trim(), status,
        items: cleaned.map((r) => ({
          id: r.id, poId: r.poId, poItemId: r.poItemId ?? null,
          clientId: r.clientId, brandId: r.brandId,
          material: r.material.trim(), colorName: r.colorName.trim(),
          orderedQty: Number(r.orderedQty) || 0,
          approvedShadeId: r.approvedShadeId || null,
          supplierShadeNumber: r.supplierShadeNumber.trim(),
        })),
      });
      toast.success("Production order updated");
      nav({ to: "/yarn/production-orders/$id", params: { id: order.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-4">
      <PageHeader title={`Edit Production Yarn Order ${order.number}`} subtitle="Received lines stay locked" />

      <Card className="p-4 grid md:grid-cols-4 gap-3">
        <div><Label>Order Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
        <div>
          <Label>Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId} disabled={anyReceived}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          {anyReceived && <p className="text-xs text-muted-foreground mt-1">Locked — yarn already received.</p>}
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProductionOrderStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="partially_received">Partially Received</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-4"><Label>Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Procurement Lines</h3>
          <Button variant="outline" size="sm" onClick={() => setPickOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Color from PO</Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>PO</TableHead><TableHead>Color</TableHead><TableHead>Material</TableHead>
              <TableHead>Ordered (Kg)</TableHead><TableHead>Received</TableHead>
              <TableHead>Approved Shade</TableHead><TableHead>Supplier Shade #</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const locked = r.receivedQty > 0.0001;
                return (
                  <TableRow key={r.id ?? `new-${i}`}>
                    <TableCell className="font-mono text-xs">{poNumber(r.poId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        <Input value={r.colorName} disabled={locked} onChange={(e) => patch(i, { colorName: e.target.value })} />
                      </div>
                    </TableCell>
                    <TableCell><Input value={r.material} onChange={(e) => patch(i, { material: e.target.value })} /></TableCell>
                    <TableCell><Input type="number" step="0.01" className="w-28" value={r.orderedQty} onChange={(e) => patch(i, { orderedQty: e.target.value })} /></TableCell>
                    <TableCell>{r.receivedQty.toFixed(2)}</TableCell>
                    <TableCell>
                      <Select value={r.approvedShadeId || "none"}
                        onValueChange={(v) => {
                          if (v === "none") { patch(i, { approvedShadeId: "" }); return; }
                          const sh = shades.find((s) => s.id === v);
                          patch(i, { approvedShadeId: v, supplierShadeNumber: sh?.supplierShadeNumber ?? r.supplierShadeNumber });
                        }}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Optional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— None —</SelectItem>
                          {shades.filter((s) => s.status === "approved").map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.colorName} · {s.supplierShadeNumber}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input className="w-36" value={r.supplierShadeNumber} onChange={(e) => patch(i, { supplierShadeNumber: e.target.value })} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" disabled={locked}
                        title={locked ? "Received lines cannot be deleted" : "Delete line"}
                        onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm text-muted-foreground mt-2">Ordered qty cannot be set below the quantity already received.</p>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/production-orders/$id", params: { id: order.id } })}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </div>

      <Dialog open={pickOpen} onOpenChange={(o) => { setPickOpen(o); if (!o) setPickedPoId(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Add Color from a PO</DialogTitle></DialogHeader>
          {!pickedPo ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search PO number…" value={poQuery} onChange={(e) => setPoQuery(e.target.value)} />
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>PO #</TableHead><TableHead>PO Date</TableHead><TableHead>Items</TableHead><TableHead className="w-[80px]"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {poList.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono">{p.poNumber}</TableCell>
                        <TableCell>{p.poDate}</TableCell>
                        <TableCell>{p.items.length}</TableCell>
                        <TableCell><Button size="sm" variant="outline" onClick={() => setPickedPoId(p.id)}>Select</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="font-mono">{pickedPo.poNumber}</Badge>
                <button className="underline text-muted-foreground" onClick={() => setPickedPoId(null)}>change PO</button>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Color</TableHead><TableHead>Material</TableHead><TableHead className="w-[80px]"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pickedColors.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.material}</TableCell>
                        <TableCell><Button size="sm" variant="outline" onClick={() => addLine(c)}>Add</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}