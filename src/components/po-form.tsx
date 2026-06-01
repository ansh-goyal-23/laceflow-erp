import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore, store, nextPONumber, type PurchaseOrder, type POLineItem } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Save, Send } from "lucide-react";
import { BrandDialog } from "@/components/brand-dialog";
import { ClientDialog } from "@/components/client-dialog";
import { toast } from "sonner";

function emptyItem(): POLineItem {
  return {
    id: crypto.randomUUID(),
    articleCode: "", laceType: "", materialType: "", noOfColors: "",
    width: "", length: "", color: "", uom: "Mtr", quantity: 0, rate: 0,
  };
}

const UOMS = ["Mtr", "Pcs", "Pair", "Kg", "Roll"];

export function POForm({ existing }: { existing?: PurchaseOrder }) {
  const navigate = useNavigate();
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);

  const today = new Date().toISOString().slice(0, 10);

  const [brandId, setBrandId] = useState(existing?.brandId ?? "");
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [poNumber, setPoNumber] = useState(existing?.poNumber ?? "");
  const [poDate, setPoDate] = useState(existing?.poDate ?? today);
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate ?? "");
  const [items, setItems] = useState<POLineItem[]>(existing?.items?.length ? existing.items : [emptyItem()]);

  const [brandOpen, setBrandOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);

  useEffect(() => {
    if (!existing && !poNumber) setPoNumber(nextPONumber(pos));
  }, [existing, poNumber, pos]);

  const dateError = useMemo(() => {
    if (poDate && deliveryDate && deliveryDate < poDate) return "Delivery Date cannot be earlier than PO Date";
    return null;
  }, [poDate, deliveryDate]);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.rate) || 0), 0),
    [items],
  );

  function updateItem(id: string, patch: Partial<POLineItem>) {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function validate(submit: boolean) {
    if (!brandId) return "Select a brand";
    if (!clientId) return "Select a client";
    if (!poNumber.trim()) return "PO Number is required";
    if (!poDate) return "PO Date is required";
    if (!deliveryDate) return "Delivery Date is required";
    if (dateError) return dateError;
    if (submit && items.every((i) => !i.articleCode.trim() && !i.quantity)) return "Add at least one line item";
    return null;
  }

  function save(status: "draft" | "submitted") {
    const err = validate(status === "submitted");
    if (err) { toast.error(err); return; }
    const payload = { poNumber: poNumber.trim(), brandId, clientId, poDate, deliveryDate, items, status };
    if (existing) {
      store.updatePO(existing.id, payload);
      toast.success(status === "draft" ? "Draft saved" : "PO updated");
    } else {
      store.addPO(payload);
      toast.success(status === "draft" ? "Draft saved" : "PO submitted");
    }
    navigate({ to: "/purchase-orders" });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>PO Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Brand</Label>
            <div className="flex gap-2">
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {brands.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No brands yet</div>
                  ) : brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setBrandOpen(true)} title="Add Brand">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Client</Label>
            <div className="flex gap-2">
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No clients yet</div>
                  ) : clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setClientOpen(true)} title="Add Client">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>PO Number</Label>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>PO Date</Label>
            <Input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-start-1">
            <Label>Delivery Date</Label>
            <Input type="date" value={deliveryDate} min={poDate || undefined} onChange={(e) => setDeliveryDate(e.target.value)} />
            {dateError && <p className="text-xs text-destructive">{dateError}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((a) => [...a, emptyItem()])}>
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">Article Code</TableHead>
                  <TableHead className="min-w-32">Lace Type</TableHead>
                  <TableHead className="min-w-32">Material Type</TableHead>
                  <TableHead className="w-24">Colors</TableHead>
                  <TableHead className="w-24">Width</TableHead>
                  <TableHead className="w-24">Length</TableHead>
                  <TableHead className="min-w-28">Color</TableHead>
                  <TableHead className="w-24">UOM</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                  <TableHead className="w-28">Rate</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell><Input value={it.articleCode} onChange={(e) => updateItem(it.id, { articleCode: e.target.value })} /></TableCell>
                    <TableCell><Input value={it.laceType} onChange={(e) => updateItem(it.id, { laceType: e.target.value })} /></TableCell>
                    <TableCell><Input value={it.materialType} onChange={(e) => updateItem(it.id, { materialType: e.target.value })} /></TableCell>
                    <TableCell><Input value={it.noOfColors} onChange={(e) => updateItem(it.id, { noOfColors: e.target.value })} /></TableCell>
                    <TableCell><Input value={it.width} onChange={(e) => updateItem(it.id, { width: e.target.value })} /></TableCell>
                    <TableCell><Input value={it.length} onChange={(e) => updateItem(it.id, { length: e.target.value })} /></TableCell>
                    <TableCell><Input value={it.color} onChange={(e) => updateItem(it.id, { color: e.target.value })} /></TableCell>
                    <TableCell>
                      <Select value={it.uom} onValueChange={(v) => updateItem(it.id, { uom: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" min="0" step="any" value={it.quantity || ""} onChange={(e) => updateItem(it.id, { quantity: parseFloat(e.target.value) || 0 })} /></TableCell>
                    <TableCell><Input type="number" min="0" step="any" value={it.rate || ""} onChange={(e) => updateItem(it.id, { rate: parseFloat(e.target.value) || 0 })} /></TableCell>
                    <TableCell className="text-right font-medium">
                      {((it.quantity || 0) * (it.rate || 0)).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" disabled={items.length === 1}
                        onClick={() => setItems((a) => a.filter((x) => x.id !== it.id))}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-end text-sm">
            <div className="bg-muted px-4 py-2 rounded-md">
              <span className="text-muted-foreground mr-2">Total:</span>
              <span className="font-semibold text-base">{total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/purchase-orders" })}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={() => save("draft")}>
          <Save className="h-4 w-4 mr-1" /> Save Draft
        </Button>
        <Button type="button" onClick={() => save("submitted")}>
          <Send className="h-4 w-4 mr-1" /> Submit PO
        </Button>
      </div>

      <BrandDialog open={brandOpen} onOpenChange={setBrandOpen} onSaved={(b) => setBrandId(b.id)} />
      <ClientDialog open={clientOpen} onOpenChange={setClientOpen} onSaved={(c) => setClientId(c.id)} />
    </div>
  );
}