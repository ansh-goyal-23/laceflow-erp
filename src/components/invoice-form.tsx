import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore, store, type Invoice, type InvoiceItem, type PurchaseOrder, type POLineItem } from "@/lib/store";
import { dispatchedByPOItem, dispatchedByPO, poFulfillmentStatus, statusBadgeClass } from "@/lib/dispatch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Draft = Omit<InvoiceItem, "id" | "invoiceId">;

export function InvoiceForm({ existing }: { existing?: Invoice }) {
  const navigate = useNavigate();
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);
  const invoices = useStore((s) => s.invoices);

  const today = new Date().toISOString().slice(0, 10);

  const [invoiceNumber, setInvoiceNumber] = useState(existing?.invoiceNumber ?? "");
  const [dispatchDate, setDispatchDate] = useState(existing?.dispatchDate ?? today);
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [items, setItems] = useState<Draft[]>(
    existing?.items.map((i) => ({
      poId: i.poId, poItemId: i.poItemId, poNumber: i.poNumber,
      articleCode: i.articleCode, laceType: i.laceType, materialType: i.materialType,
      width: i.width, length: i.length, color: i.color, uom: i.uom,
      dispatchQty: i.dispatchQty, rate: i.rate,
    })) ?? [],
  );
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [poRows, setPoRows] = useState<Record<string, number>>({}); // poItemId -> qty input

  // Dispatched maps exclude current invoice when editing so balances reflect "other invoices"
  const dispByItem = useMemo(() => dispatchedByPOItem(invoices, existing?.id), [invoices, existing?.id]);
  const dispByPo = useMemo(() => dispatchedByPO(invoices, existing?.id), [invoices, existing?.id]);

  // Open POs for the chosen client (submitted, not fully completed)
  const clientPOs = useMemo(() => {
    if (!clientId) return [];
    return pos
      .filter((p) => p.clientId === clientId && p.status === "submitted")
      .map((p) => ({ po: p, status: poFulfillmentStatus(p, dispByItem, dispByPo) }))
      .filter(({ status }) => status !== "Completed")
      .sort((a, b) => a.po.poNumber.localeCompare(b.po.poNumber));
  }, [pos, clientId, dispByItem, dispByPo]);

  const selectedPO = pos.find((p) => p.id === selectedPoId);

  useEffect(() => {
    // reset selection when client changes
    setSelectedPoId("");
    setPoRows({});
  }, [clientId]);

  useEffect(() => {
    setPoRows({});
  }, [selectedPoId]);

  function balanceFor(item: POLineItem): number {
    return (Number(item.quantity) || 0) - (dispByItem.get(item.id) ?? 0);
  }

  function addPoItemsToInvoice() {
    if (!selectedPO) return;
    const adds: Draft[] = [];
    let warn = false;
    for (const it of selectedPO.items) {
      const qty = Number(poRows[it.id]) || 0;
      if (qty <= 0) continue;
      const bal = balanceFor(it);
      if (qty > bal) warn = true;
      adds.push({
        poId: selectedPO.id,
        poItemId: it.id,
        poNumber: selectedPO.poNumber,
        articleCode: it.articleCode,
        laceType: it.laceType,
        materialType: it.materialType,
        width: it.width,
        length: it.length,
        color: it.color,
        uom: it.uom,
        dispatchQty: qty,
        rate: it.rate,
      });
    }
    if (adds.length === 0) {
      toast.info("Enter dispatch qty greater than 0 for at least one row");
      return;
    }
    setItems((prev) => [...prev, ...adds]);
    setSelectedPoId("");
    setPoRows({});
    if (warn) toast.warning("Some dispatch quantities exceed the pending balance");
    else toast.success(`${adds.length} item(s) added to invoice`);
  }

  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }
  function patchItem(idx: number, patch: Partial<Draft>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  const totals = useMemo(() => {
    const qty = items.reduce((s, i) => s + (Number(i.dispatchQty) || 0), 0);
    const amt = items.reduce((s, i) => s + (Number(i.dispatchQty) || 0) * (Number(i.rate) || 0), 0);
    return { qty, amt };
  }, [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, { poNumber: string; rows: { item: Draft; idx: number }[] }>();
    items.forEach((it, idx) => {
      const key = it.poNumber || "—";
      const g = map.get(key) ?? { poNumber: key, rows: [] };
      g.rows.push({ item: it, idx });
      map.set(key, g);
    });
    return Array.from(map.values());
  }, [items]);

  async function submit() {
    if (!invoiceNumber.trim()) return toast.error("Invoice Number is required");
    if (!dispatchDate) return toast.error("Dispatch Date is required");
    if (!clientId) return toast.error("Client is required");
    if (items.length === 0) return toast.error("Add at least one item");

    try {
      const payload = { invoiceNumber: invoiceNumber.trim(), dispatchDate, clientId, items };
      if (existing) {
        await store.updateInvoice(existing.id, payload);
        toast.success("Invoice updated");
      } else {
        await store.addInvoice(payload);
        toast.success("Invoice created");
      }
      navigate({ to: "/invoices" });
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to save invoice");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Invoice Number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Enter invoice no." />
          </div>
          <div className="space-y-2">
            <Label>Dispatch Date</Label>
            <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {clients.length === 0
                  ? <div className="px-3 py-2 text-sm text-muted-foreground">No clients</div>
                  : clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {clientId && (
        <Card>
          <CardHeader><CardTitle>Open Purchase Orders</CardTitle></CardHeader>
          <CardContent>
            {clientPOs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No open purchase orders for this client.</div>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>PO Date</TableHead>
                      <TableHead>Delivery Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientPOs.map(({ po, status }) => (
                      <TableRow key={po.id} data-state={selectedPoId === po.id ? "selected" : undefined}>
                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                        <TableCell>{po.poDate}</TableCell>
                        <TableCell>{po.deliveryDate}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(status)}`}>{status}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant={selectedPoId === po.id ? "default" : "outline"}
                            onClick={() => setSelectedPoId(po.id === selectedPoId ? "" : po.id)}>
                            {selectedPoId === po.id ? "Selected" : "Select"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedPO && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>PO {selectedPO.poNumber} — Line Items</CardTitle>
            <Button onClick={addPoItemsToInvoice}><Plus className="h-4 w-4 mr-1" /> Add To Invoice</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Lace</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Width</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="w-28">Dispatch Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPO.items.map((it) => {
                  const already = dispByItem.get(it.id) ?? 0;
                  const bal = balanceFor(it);
                  const v = poRows[it.id] ?? 0;
                  const over = v > bal;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{it.articleCode || "—"}</TableCell>
                      <TableCell>{it.laceType || "—"}</TableCell>
                      <TableCell>{it.materialType || "—"}</TableCell>
                      <TableCell>{it.width || "—"}</TableCell>
                      <TableCell>{it.length || "—"}</TableCell>
                      <TableCell>{it.color || "—"}</TableCell>
                      <TableCell>{it.uom}</TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell className="text-right">{already}</TableCell>
                      <TableCell className={`text-right ${bal <= 0 ? "text-muted-foreground" : ""}`}>{bal}</TableCell>
                      <TableCell className="text-right">{it.rate}</TableCell>
                      <TableCell>
                        <Input
                          type="number" min="0" step="any"
                          className={over ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                          value={poRows[it.id] ?? ""}
                          onChange={(e) => setPoRows((r) => ({ ...r, [it.id]: parseFloat(e.target.value) || 0 }))}
                        />
                        {over && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-600 mt-1">
                            <AlertTriangle className="h-3 w-3" /> Exceeds balance
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Invoice Items</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {grouped.map((g) => (
              <div key={g.poNumber} className="border rounded-md">
                <div className="px-3 py-2 bg-muted/50 text-sm font-medium">PO {g.poNumber}</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Article</TableHead>
                        <TableHead>Lace</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>W×L</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead className="w-24">Qty</TableHead>
                        <TableHead className="w-24">Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.rows.map(({ item, idx }) => (
                        <TableRow key={idx}>
                          <TableCell>{item.articleCode || "—"}</TableCell>
                          <TableCell>{item.laceType || "—"}</TableCell>
                          <TableCell>{item.materialType || "—"}</TableCell>
                          <TableCell>{[item.width, item.length].filter(Boolean).join(" × ") || "—"}</TableCell>
                          <TableCell>{item.color || "—"}</TableCell>
                          <TableCell>{item.uom}</TableCell>
                          <TableCell>
                            <Input type="number" min="0" step="any" value={item.dispatchQty || ""}
                              onChange={(e) => patchItem(idx, { dispatchQty: parseFloat(e.target.value) || 0 })} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" min="0" step="any" value={item.rate || ""}
                              onChange={(e) => patchItem(idx, { rate: parseFloat(e.target.value) || 0 })} />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {((item.dispatchQty || 0) * (item.rate || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-6 text-sm">
              <div className="bg-muted px-4 py-2 rounded-md">
                <span className="text-muted-foreground mr-2">Total Qty:</span>
                <span className="font-semibold">{totals.qty}</span>
              </div>
              <div className="bg-muted px-4 py-2 rounded-md">
                <span className="text-muted-foreground mr-2">Total Amount:</span>
                <span className="font-semibold text-base">{totals.amt.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/invoices" })}>Cancel</Button>
        <Button onClick={submit}>
          <Send className="h-4 w-4 mr-1" /> {existing ? "Update Invoice" : "Submit Invoice"}
        </Button>
      </div>
    </div>
  );
}