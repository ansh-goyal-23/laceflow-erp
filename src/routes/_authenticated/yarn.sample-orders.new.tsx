import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore, sampleExpectedDelivery } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/sample-orders/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    poId: typeof s.poId === "string" ? s.poId : undefined,
  }),
  component: NewSampleOrder,
});

type Draft = {
  clientId: string; brandId: string; colorName: string; material: string;
  approxQty: string; pantone: string; remarks: string;
};

function emptyDraft(): Draft {
  return { clientId: "", brandId: "", colorName: "", material: "", approxQty: "", pantone: "", remarks: "" };
}

function NewSampleOrder() {
  const nav = useNavigate();
  const search = useSearch({ from: "/_authenticated/yarn/sample-orders/new" });
  const suppliers = useYarnStore((s) => s.suppliers);
  const clients = useStore((s) => s.clients);
  const brands = useStore((s) => s.brands);
  const pos = useStore((s) => s.purchaseOrders);

  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [linkedPoId, setLinkedPoId] = useState<string>(search.poId ?? "");
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<Draft[]>([emptyDraft()]);

  const patch = (idx: number, k: keyof Draft, v: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  const save = () => {
    if (!supplierId) { toast.error("Select supplier"); return; }
    const cleaned = items.filter((i) => i.clientId && i.brandId && i.colorName.trim() && i.material.trim());
    if (cleaned.length === 0) { toast.error("Add at least one valid item"); return; }
    const order = yarnStore.addSampleOrder({
      supplierId, orderDate, linkedPoId: linkedPoId || null, remarks,
      items: cleaned.map((i) => ({
        clientId: i.clientId, brandId: i.brandId,
        colorName: i.colorName.trim(), material: i.material.trim(),
        approxQty: Number(i.approxQty) || 0,
        pantone: i.pantone || undefined,
        remarks: i.remarks || undefined,
      })),
    });
    toast.success(`Sample order ${order.number} created`);
    nav({ to: "/yarn/sample-orders/$id", params: { id: order.id } });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-4">
      <PageHeader title="New Sample Yarn Order" subtitle="Expected delivery = Order Date + 7 days" />
      <Card className="p-4 grid md:grid-cols-4 gap-3">
        <div><Label>Order Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
        <div><Label>Expected Delivery</Label><Input value={sampleExpectedDelivery(orderDate)} readOnly className="bg-muted" /></div>
        <div><Label>Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Linked Production PO</Label>
          <Select value={linkedPoId || "none"} onValueChange={(v) => setLinkedPoId(v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {pos.filter((p) => p.status === "open").map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-4"><Label>Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Sample Items</h3>
          <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyDraft()])}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Approx Qty (Kg)</TableHead>
                <TableHead>Pantone</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Select value={it.clientId} onValueChange={(v) => patch(i, "clientId", v)}>
                      <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
                      <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={it.brandId} onValueChange={(v) => patch(i, "brandId", v)}>
                      <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
                      <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input value={it.colorName} onChange={(e) => patch(i, "colorName", e.target.value)} /></TableCell>
                  <TableCell><Input value={it.material} onChange={(e) => patch(i, "material", e.target.value)} /></TableCell>
                  <TableCell><Input type="number" step="0.01" value={it.approxQty} onChange={(e) => patch(i, "approxQty", e.target.value)} /></TableCell>
                  <TableCell><Input value={it.pantone} onChange={(e) => patch(i, "pantone", e.target.value)} /></TableCell>
                  <TableCell><Input value={it.remarks} onChange={(e) => patch(i, "remarks", e.target.value)} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/sample-orders" })}>Cancel</Button>
        <Button onClick={save}>Create Sample Order</Button>
      </div>
    </div>
  );
}
