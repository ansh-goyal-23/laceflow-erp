import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore, store, type SalesReturn, type SalesReturnItem, type SalesReturnDocType } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Trash2, Send, ChevronsUpDown, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { returnedByPOItem } from "@/lib/dispatch";

type Draft = Omit<SalesReturnItem, "id" | "returnId">;

const REASONS = ["Defective", "Damaged in transit", "Wrong item", "Quality rejection", "Excess supply", "Other"];

function emptyDraft(): Draft {
  return {
    invoiceId: null, invoiceItemId: null, invoiceNumber: "",
    poId: null, poItemId: null, poNumber: "",
    articleCode: "", laceType: "", materialType: "", width: "", length: "", color: "",
    uom: "Mtr", returnQty: 0, rate: 0, reason: "", settled: false, settledQty: 0,
  };
}

export function nextReturnNumber(existing: SalesReturn[]): string {
  const year = new Date().getFullYear();
  const prefix = `SR-${year}-`;
  const nums = existing
    .map((r) => r.returnNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  return `${prefix}${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0")}`;
}

export function SalesReturnForm({ existing }: { existing?: SalesReturn }) {
  const navigate = useNavigate();
  const clients = useStore((s) => s.clients);
  const invoices = useStore((s) => s.invoices);
  const pos = useStore((s) => s.purchaseOrders);
  const returns = useStore((s) => s.salesReturns);

  const today = new Date().toISOString().slice(0, 10);

  const [returnNumber, setReturnNumber] = useState(existing?.returnNumber ?? "");
  const [returnDate, setReturnDate] = useState(existing?.returnDate ?? today);
  const [clientId, setClientId] = useState(existing?.clientId ?? "");
  const [docType, setDocType] = useState<SalesReturnDocType>(existing?.docType ?? "debit_note");
  const [referenceNumber, setReferenceNumber] = useState(existing?.referenceNumber ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [items, setItems] = useState<Draft[]>(
    existing?.items.map(({ id: _id, returnId: _rid, ...rest }) => ({ ...rest })) ?? [],
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [qtyRows, setQtyRows] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing && !returnNumber) setReturnNumber(nextReturnNumber(returns));
  }, [returns, existing, returnNumber]);

  useEffect(() => { setSelectedInvoiceId(""); setQtyRows({}); }, [clientId]);
  useEffect(() => { setQtyRows({}); }, [selectedInvoiceId]);

  // already returned per invoice item (excluding this return when editing)
  const returnedByInvItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of returns) {
      if (existing && r.id === existing.id) continue;
      for (const it of r.items) {
        if (!it.invoiceItemId) continue;
        m.set(it.invoiceItemId, (m.get(it.invoiceItemId) ?? 0) + (Number(it.returnQty) || 0));
      }
    }
    return m;
  }, [returns, existing]);

  const retByPoItem = useMemo(() => returnedByPOItem(returns, existing?.id), [returns, existing?.id]);

  const clientInvoices = useMemo(
    () => invoices.filter((i) => i.clientId === clientId).sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate)),
    [invoices, clientId],
  );
  const clientPOs = useMemo(
    () => pos.filter((p) => p.clientId === clientId).sort((a, b) => a.poNumber.localeCompare(b.poNumber)),
    [pos, clientId],
  );
  const selectedInvoice = invoices.find((i) => i.id === selectedInvoiceId);

  function addInvoiceLines() {
    if (!selectedInvoice) return;
    const adds: Draft[] = [];
    let warn = false;
    for (const it of selectedInvoice.items) {
      const qty = Number(qtyRows[it.id]) || 0;
      if (qty <= 0) continue;
      const alreadyRet = returnedByInvItem.get(it.id) ?? 0;
      if (qty + alreadyRet > (Number(it.dispatchQty) || 0)) warn = true;
      adds.push({
        invoiceId: selectedInvoice.id,
        invoiceItemId: it.id,
        invoiceNumber: selectedInvoice.invoiceNumber,
        poId: it.poId,
        poItemId: it.poItemId,
        poNumber: it.poNumber,
        articleCode: it.articleCode, laceType: it.laceType, materialType: it.materialType,
        width: it.width, length: it.length, color: it.color, uom: it.uom,
        returnQty: qty, rate: it.rate, reason: "", settled: false, settledQty: 0,
      });
    }
    if (!adds.length) return toast.info("Enter return qty greater than 0 for at least one row");
    setItems((p) => [...p, ...adds]);
    setSelectedInvoiceId("");
    setQtyRows({});
    if (warn) toast.warning("Some return quantities exceed the dispatched quantity");
    else toast.success(`${adds.length} line(s) added`);
  }

  function patch(idx: number, p: Partial<Draft>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  const totals = useMemo(() => {
    const qty = items.reduce((s, i) => s + (Number(i.returnQty) || 0), 0);
    const amt = items.reduce((s, i) => s + (Number(i.returnQty) || 0) * (Number(i.rate) || 0), 0);
    return { qty, amt };
  }, [items]);

  const untraceableCount = items.filter((i) => !i.poId).length;

  async function submit() {
    if (saving) return;
    if (!returnNumber.trim()) return toast.error("Return Number is required");
    if (!returnDate) return toast.error("Return Date is required");
    if (!clientId) return toast.error("Client is required");
    if (!items.length) return toast.error("Add at least one returned item");
    if (items.some((i) => (Number(i.returnQty) || 0) <= 0)) return toast.error("Every line needs a return qty greater than 0");

    setSaving(true);
    try {
      const payload = {
        returnNumber: returnNumber.trim(), returnDate, clientId, docType,
        referenceNumber, dueDate, remarks, items,
      };
      if (existing) {
        await store.updateSalesReturn(existing.id, payload);
        toast.success("Sales return updated");
      } else {
        await store.addSalesReturn(payload);
        toast.success("Sales return recorded");
      }
      navigate({ to: "/sales-returns" });
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to save sales return");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Return Details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Return Number</Label>
            <Input value={returnNumber} onChange={(e) => setReturnNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Return Date</Label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as SalesReturnDocType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="debit_note">Debit Note</SelectItem>
                <SelectItem value="return_challan">Return Challan</SelectItem>
              </SelectContent>
            </Select>
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
          <div className="space-y-2">
            <Label>Client Document No. (optional)</Label>
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Their debit note / challan no." />
          </div>
          <div className="space-y-2">
            <Label>Re-supply Due Date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      {clientId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pick Invoice Lines</CardTitle>
            <Button variant="outline" onClick={() => setItems((p) => [...p, emptyDraft()])}>
              <Plus className="h-4 w-4 mr-1" /> Add manual line
            </Button>
          </CardHeader>
          <CardContent>
            {clientInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground">No invoices for this client — use “Add manual line”.</div>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full md:w-96 justify-between">
                    {selectedInvoice ? `${selectedInvoice.invoiceNumber} · ${selectedInvoice.dispatchDate}` : "Search and select invoice…"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full md:w-96 p-0">
                  <Command>
                    <CommandInput placeholder="Search invoice number…" />
                    <CommandList>
                      <CommandEmpty>No invoice found.</CommandEmpty>
                      <CommandGroup>
                        {clientInvoices.map((inv) => (
                          <CommandItem key={inv.id} value={inv.invoiceNumber} onSelect={() => setSelectedInvoiceId(inv.id === selectedInvoiceId ? "" : inv.id)}>
                            <Check className={cn("mr-2 h-4 w-4", selectedInvoiceId === inv.id ? "opacity-100" : "opacity-0")} />
                            {inv.invoiceNumber}
                            <span className="ml-auto text-xs text-muted-foreground">{inv.dispatchDate}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </CardContent>
        </Card>
      )}

      {selectedInvoice && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Invoice {selectedInvoice.invoiceNumber} — Dispatched Lines</CardTitle>
            <Button onClick={addInvoiceLines}><Plus className="h-4 w-4 mr-1" /> Add To Return</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>W×L</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Dispatched</TableHead>
                  <TableHead className="text-right">Already Returned</TableHead>
                  <TableHead className="w-28">Return Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedInvoice.items.map((it) => {
                  const already = returnedByInvItem.get(it.id) ?? 0;
                  const max = (Number(it.dispatchQty) || 0) - already;
                  const v = qtyRows[it.id] ?? 0;
                  const over = v > max;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        {it.poNumber || "—"}
                        {!it.poItemId && (
                          <span className="ml-1 text-[11px] text-amber-600">unlinked</span>
                        )}
                      </TableCell>
                      <TableCell>{it.articleCode || "—"}</TableCell>
                      <TableCell>{[it.width, it.length].filter(Boolean).join(" × ") || "—"}</TableCell>
                      <TableCell>{it.color || "—"}</TableCell>
                      <TableCell>{it.uom}</TableCell>
                      <TableCell className="text-right">{it.dispatchQty}</TableCell>
                      <TableCell className="text-right">{already || 0}</TableCell>
                      <TableCell>
                        <Input type="number" min="0" step="any"
                          className={over ? "border-amber-500 focus-visible:ring-amber-500" : ""}
                          value={qtyRows[it.id] ?? ""}
                          onChange={(e) => setQtyRows((r) => ({ ...r, [it.id]: parseFloat(e.target.value) || 0 }))} />
                        {over && (
                          <div className="flex items-center gap-1 text-[11px] text-amber-600 mt-1">
                            <AlertTriangle className="h-3 w-3" /> Exceeds dispatched
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
          <CardHeader><CardTitle>Returned Items</CardTitle></CardHeader>
          <CardContent className="space-y-3 overflow-x-auto">
            {untraceableCount > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
                <span>
                  {untraceableCount} line(s) are not linked to a PO. These will show as standalone client pendency
                  until you mark them settled.
                </span>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">PO (optional)</TableHead>
                  <TableHead>Article</TableHead>
                  <TableHead>Lace</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Width</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-24">Rate</TableHead>
                  <TableHead className="min-w-36">Reason</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const po = item.poId ? pos.find((p) => p.id === item.poId) : undefined;
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        {item.invoiceItemId ? (
                          <div className="text-sm">
                            {item.poNumber || <span className="text-amber-600">No PO link</span>}
                            <div className="text-[11px] text-muted-foreground">Inv {item.invoiceNumber}</div>
                          </div>
                        ) : (
                          <Select
                            value={item.poId ?? "none"}
                            onValueChange={(v) => {
                              if (v === "none") return patch(idx, { poId: null, poItemId: null, poNumber: "" });
                              const p = pos.find((x) => x.id === v);
                              patch(idx, { poId: v, poItemId: null, poNumber: p?.poNumber ?? "" });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="No PO" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No PO (client pendency)</SelectItem>
                              {clientPOs.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        {po && !item.poItemId && (
                          <Select
                            value={item.poItemId ?? "none"}
                            onValueChange={(v) => {
                              if (v === "none") return patch(idx, { poItemId: null });
                              const li = po.items.find((x) => x.id === v);
                              patch(idx, {
                                poItemId: v,
                                articleCode: li?.articleCode ?? item.articleCode,
                                laceType: li?.laceType ?? item.laceType,
                                materialType: li?.materialType ?? item.materialType,
                                width: li?.width ?? item.width,
                                length: li?.length ?? item.length,
                                color: li?.color ?? item.color,
                                uom: li?.uom ?? item.uom,
                                rate: Number(li?.rate) || item.rate,
                              });
                            }}
                          >
                            <SelectTrigger className="mt-1"><SelectValue placeholder="PO item (optional)" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No specific item</SelectItem>
                              {po.items.map((li) => (
                                <SelectItem key={li.id} value={li.id}>
                                  {[li.articleCode, li.color, li.width].filter(Boolean).join(" · ")} (ret {retByPoItem.get(li.id) ?? 0})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell><Input value={item.articleCode} onChange={(e) => patch(idx, { articleCode: e.target.value })} /></TableCell>
                      <TableCell><Input value={item.laceType} onChange={(e) => patch(idx, { laceType: e.target.value })} /></TableCell>
                      <TableCell><Input value={item.materialType} onChange={(e) => patch(idx, { materialType: e.target.value })} /></TableCell>
                      <TableCell><Input value={item.width} onChange={(e) => patch(idx, { width: e.target.value })} /></TableCell>
                      <TableCell><Input value={item.length} onChange={(e) => patch(idx, { length: e.target.value })} /></TableCell>
                      <TableCell><Input value={item.color} onChange={(e) => patch(idx, { color: e.target.value })} /></TableCell>
                      <TableCell><Input value={item.uom} onChange={(e) => patch(idx, { uom: e.target.value })} /></TableCell>
                      <TableCell>
                        <Input type="number" min="0" step="any" value={item.returnQty || ""} onChange={(e) => patch(idx, { returnQty: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" min="0" step="any" value={item.rate || ""} onChange={(e) => patch(idx, { rate: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Select value={item.reason || "none"} onValueChange={(v) => patch(idx, { reason: v === "none" ? "" : v })}>
                          <SelectTrigger><SelectValue placeholder="Reason" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-end gap-8 text-sm pt-2">
              <div>Total Qty: <span className="font-medium">{totals.qty}</span></div>
              <div>Total Value: <span className="font-medium">{totals.amt.toFixed(2)}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving}>
          <Send className="h-4 w-4 mr-1" /> {saving ? "Saving…" : existing ? "Update Return" : "Save Return"}
        </Button>
      </div>
    </div>
  );
}
