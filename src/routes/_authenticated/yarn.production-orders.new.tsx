import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useYarnStore, yarnStore, STAGE_LABEL, STAGE_BADGE, poOverallStage, calculateProcurementStage, type ProcurementStage } from "@/lib/yarn-store";
import { useStore, type PurchaseOrder } from "@/lib/store";
import { daysRemaining, daysRemainingLabel } from "@/lib/reports";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/production-orders/new")({
  component: NewProdOrder,
});

interface Line {
  id: string;
  poId: string;
  poItemId?: string | null;
  clientId: string;
  brandId: string;
  material: string;
  colorName: string;
  orderedQty: string;
  approvedShadeId: string;
  supplierShadeNumber: string;
  sampling: boolean;
  reason: string;
}

const REASON_OPTIONS = ["Additional Requirement", "Production Wastage", "Shade Difference", "Other"];

function NewProdOrder() {
  const nav = useNavigate();
  const suppliers = useYarnStore((s) => s.suppliers);
  const shades = useYarnStore((s) => s.shades);
  const yarn = useYarnStore((s) => s);
  const pos = useStore((s) => s.purchaseOrders);
  const clients = useStore((s) => s.clients);
  const brands = useStore((s) => s.brands);

  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickPOOpen, setPickPOOpen] = useState(false);
  const [activePOId, setActivePOId] = useState<string | null>(null);
  const [poSearch, setPoSearch] = useState("");
  const [addShadeOpen, setAddShadeOpen] = useState<number | null>(null);
  const [newShadeNo, setNewShadeNo] = useState("");

  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const activePO = activePOId ? pos.find((p) => p.id === activePOId) : null;

  // Eligible POs: overall stage ∈ {in_sampling, waiting_for_yarn_order}
  const eligiblePOs = useMemo(() => {
    const rows = pos
      .filter((p) => p.status === "open")
      .map((p) => ({ po: p, stage: poOverallStage(yarn, p), days: daysRemaining(p.deliveryDate) }))
      .filter((r) => r.stage === "waiting_for_yarn_order" || r.stage === "in_sampling");
    rows.sort((a, b) => {
      const ag = a.days < 0 ? 0 : a.days <= 10 ? 1 : 2;
      const bg = b.days < 0 ? 0 : b.days <= 10 ? 1 : 2;
      if (ag !== bg) return ag - bg;
      return a.days - b.days;
    });
    return rows;
  }, [pos, yarn]);

  const filteredEligiblePOs = useMemo(() => {
    const q = poSearch.trim().toLowerCase();
    if (!q) return eligiblePOs;
    return eligiblePOs.filter(({ po }) => {
      const client = cName(po.clientId).toLowerCase();
      return (
        po.poNumber.toLowerCase().includes(q) ||
        client.includes(q) ||
        (po.poDate ?? "").toLowerCase().includes(q) ||
        (po.deliveryDate ?? "").toLowerCase().includes(q)
      );
    });
  }, [eligiblePOs, poSearch, clients]);

  const addLine = (po: PurchaseOrder, color: string, material: string, poItemId?: string) => {
    setLines((prev) => [...prev, {
      id: crypto.randomUUID(),
      poId: po.id,
      poItemId: poItemId ?? null,
      clientId: po.clientId,
      brandId: po.brandId,
      material, colorName: color,
      orderedQty: "",
      approvedShadeId: "",
      supplierShadeNumber: "",
      sampling: false,
      reason: "",
    }]);
  };

  const patchLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const availableShades = (line: Line) =>
    shades.filter((s) =>
      s.status === "approved" &&
      s.clientId === line.clientId &&
      s.brandId === line.brandId &&
      s.material.trim().toLowerCase() === line.material.trim().toLowerCase() &&
      s.colorName.trim().toLowerCase() === line.colorName.trim().toLowerCase() &&
      (!supplierId || s.supplierId === supplierId),
    );

  const distinctColors = (po: PurchaseOrder) => {
    const seen = new Set<string>();
    return po.items.filter((i) => {
      const k = `${i.materialType}|${i.color}`;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
  };

  // Color groups for the active PO: one row per (color, material)
  interface ColorGroup {
    key: string;
    color: string;
    material: string;
    items: PurchaseOrder["items"];
    stage: ProcurementStage;
    orderedQty: number;   // total ordered across all prod orders for this po+color+material
    receivedQty: number;
  }
  const colorGroups: ColorGroup[] = useMemo(() => {
    if (!activePO) return [];
    const map = new Map<string, ColorGroup>();
    for (const it of activePO.items) {
      const k = `${it.color}|${it.materialType}`;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          color: it.color,
          material: it.materialType,
          items: [],
          stage: calculateProcurementStage(yarn, activePO.id, it.materialType, it.color),
          orderedQty: 0,
          receivedQty: 0,
        });
      }
      map.get(k)!.items.push(it);
    }
    // sum ordered/received across production orders for this po+color+material
    for (const o of yarn.productionOrders) {
      if (o.status === "cancelled") continue;
      for (const poi of o.items) {
        if (poi.poId !== activePO.id) continue;
        const k = `${poi.colorName}|${poi.material}`;
        const g = map.get(k);
        if (!g) continue;
        g.orderedQty += poi.orderedQty;
        g.receivedQty += poi.receivedQty;
      }
    }
    return Array.from(map.values());
  }, [activePO, yarn]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const doAddShade = async () => {
    if (addShadeOpen === null) return;
    const line = lines[addShadeOpen];
    if (!supplierId) { toast.error("Select a supplier first"); return; }
    if (!newShadeNo.trim()) { toast.error("Enter supplier shade #"); return; }
    try {
      const shade = await yarnStore.ensureShade({
        clientId: line.clientId, brandId: line.brandId,
        colorName: line.colorName, material: line.material,
        supplierId, supplierShadeNumber: newShadeNo.trim(),
      });
      patchLine(addShadeOpen, { approvedShadeId: shade.id, supplierShadeNumber: shade.supplierShadeNumber });
      setAddShadeOpen(null); setNewShadeNo("");
      toast.success("Shade added to library");
    } catch (e) { toast.error((e as Error).message); }
  };

  const save = async () => {
    if (!supplierId) { toast.error("Select supplier"); return; }
    const nonSampling = lines.filter((l) => !l.sampling);
    const samplingLines = lines.filter((l) => l.sampling);

    // Validation: non-sampling lines need qty + shade
    for (const l of nonSampling) {
      if (!Number(l.orderedQty)) { toast.error("Enter quantity for all lines"); return; }
      if (!l.approvedShadeId || !l.supplierShadeNumber) { toast.error("Select or add an approved shade"); return; }
    }
    for (const l of samplingLines) {
      if (!l.material || !l.colorName) { toast.error("Sampling lines need material and color"); return; }
    }

    try {
      const samplingByPo = new Map<string, Line[]>();
      for (const l of samplingLines) {
        const arr = samplingByPo.get(l.poId) ?? [];
        arr.push(l); samplingByPo.set(l.poId, arr);
      }
      for (const [poId, arr] of samplingByPo) {
        await yarnStore.addSampleOrder({
          supplierId,
          linkedPoId: poId,
          items: arr.map((l) => ({
            clientId: l.clientId, brandId: l.brandId,
            colorName: l.colorName, material: l.material,
            approxQty: Number(l.orderedQty) || 0,
          })),
        });
      }

      if (nonSampling.length > 0) {
        const reasonNotes = nonSampling
          .map((l, i) => l.reason ? `Line ${i + 1} (${l.colorName}): ${l.reason}` : null)
          .filter(Boolean)
          .join("; ");
        const combinedRemarks = [remarks, reasonNotes].filter(Boolean).join(" | ");
        const order = await yarnStore.addProductionOrder({
          supplierId, orderDate, remarks: combinedRemarks,
          items: nonSampling.map((l) => ({
            poId: l.poId,
            poItemId: l.poItemId ?? null,
            clientId: l.clientId, brandId: l.brandId,
            material: l.material, colorName: l.colorName,
            orderedQty: Number(l.orderedQty) || 0,
            approvedShadeId: l.approvedShadeId || null,
            supplierShadeNumber: l.supplierShadeNumber,
          })),
        });
        toast.success(`Production order ${order.number} created`);
        nav({ to: "/yarn/production-orders/$id", params: { id: order.id } });
      } else if (samplingByPo.size > 0) {
        toast.success("Sample yarn orders created");
        nav({ to: "/yarn/sample-orders" });
      } else {
        toast.error("Add at least one line");
      }
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] space-y-4">
      <PageHeader title="New Production Yarn Order" subtitle="Select supplier, add POs, allocate quantities and shades" />

      <Card className="p-4 grid md:grid-cols-4 gap-3">
        <div><Label>Order Date</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
        <div><Label>Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Label>Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* LEFT — read-only PO */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Selected Purchase Order</h3>
            <Button variant="outline" size="sm" disabled={!supplierId} onClick={() => setPickPOOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add PO
            </Button>
          </div>
          {!activePO ? (
            <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
              {supplierId ? "Click \"Add PO\" to view a Purchase Order here." : "Select a supplier to begin."}
            </div>
          ) : (
            <div>
              <div className="mb-2 text-sm flex flex-wrap gap-3">
                <span><span className="text-muted-foreground">PO:</span> <span className="font-mono font-medium">{activePO.poNumber}</span></span>
                <span><span className="text-muted-foreground">Client:</span> {cName(activePO.clientId)}</span>
                <span><span className="text-muted-foreground">Delivery:</span> {activePO.deliveryDate}</span>
                <Badge variant="outline">{daysRemainingLabel(daysRemaining(activePO.deliveryDate))}</Badge>
              </div>
              <div className="rounded-md border max-h-[520px] overflow-y-auto divide-y">
                {colorGroups.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">This PO has no items.</div>
                ) : colorGroups.map((g) => {
                  const isOpen = !!expanded[g.key];
                  return (
                    <div key={g.key} className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="p-1 rounded hover:bg-muted"
                          onClick={() => setExpanded((e) => ({ ...e, [g.key]: !isOpen }))}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{g.color}</span>
                            <span className="text-xs text-muted-foreground">· {g.material}</span>
                            <Badge className={STAGE_BADGE[g.stage]} variant="secondary">{STAGE_LABEL[g.stage]}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Ordered: <span className="font-medium text-foreground">{g.orderedQty.toFixed(2)} Kg</span>
                            <span className="mx-2">·</span>
                            Received: <span className="font-medium text-foreground">{g.receivedQty.toFixed(2)} Kg</span>
                            <span className="mx-2">·</span>
                            {g.items.length} item{g.items.length === 1 ? "" : "s"}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => addLine(activePO, g.color, g.material)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Order
                        </Button>
                      </div>
                      {isOpen && (
                        <div className="ml-7 mt-2 rounded-md border bg-muted/30">
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead className="h-8">Article</TableHead>
                              <TableHead className="h-8">Lace</TableHead>
                              <TableHead className="h-8">W×L</TableHead>
                              <TableHead className="h-8">Qty</TableHead>
                              <TableHead className="h-8">UOM</TableHead>
                              <TableHead className="h-8"></TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {g.items.map((it) => (
                                <TableRow key={it.id}>
                                  <TableCell className="font-mono text-xs">{it.articleCode}</TableCell>
                                  <TableCell>{it.laceType}</TableCell>
                                  <TableCell>{it.width}×{it.length}</TableCell>
                                  <TableCell>{it.quantity}</TableCell>
                                  <TableCell>{it.uom}</TableCell>
                                  <TableCell><OverrideToggle poItemId={it.id} current={g.stage} /></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* RIGHT — Procurement entries */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Procurement Entries</h3>
          </div>
          {lines.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
              Pick a PO on the left, then choose a color below to add procurement lines.
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const po = pos.find((p) => p.id === line.poId);
                const shadeOptions = availableShades(line);
                return (
                  <div key={line.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div><span className="font-mono">{po?.poNumber}</span> · {cName(line.clientId)}</div>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Color</Label>
                        <div className="h-10 px-3 rounded-md border bg-muted/30 flex items-center text-sm">
                          <span className="font-medium">{line.colorName}</span>
                          <span className="text-muted-foreground ml-2">· {line.material}</span>
                        </div>
                      </div>
                      <div><Label className="text-xs">Order Qty (Kg)</Label>
                        <Input type="number" step="0.01" value={line.orderedQty} onChange={(e) => patchLine(idx, { orderedQty: e.target.value })} />
                      </div>
                      <div className="col-span-2"><Label className="text-xs">Approved Shade</Label>
                        <div className="flex gap-2">
                          <Select value={line.approvedShadeId} onValueChange={(v) => {
                            const s = shades.find((x) => x.id === v);
                            patchLine(idx, { approvedShadeId: v, supplierShadeNumber: s?.supplierShadeNumber ?? "" });
                          }}>
                            <SelectTrigger className="flex-1"><SelectValue placeholder={shadeOptions.length ? "Select shade" : "No shades found"} /></SelectTrigger>
                            <SelectContent>
                              {shadeOptions.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.supplierShadeNumber}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => { setAddShadeOpen(idx); setNewShadeNo(""); }}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> New
                          </Button>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Reason (optional)</Label>
                        <Select value={line.reason} onValueChange={(v) => patchLine(idx, { reason: v })}>
                          <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                          <SelectContent>
                            {REASON_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 flex items-center justify-between border-t pt-2">
                        <div className="flex items-center gap-2">
                          <Switch checked={line.sampling} onCheckedChange={(c) => patchLine(idx, { sampling: c })} />
                          <Label className="text-xs">Sampling (creates Sample Order instead)</Label>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activePO && lines.length > 0 && (
            <div className="text-xs text-muted-foreground mt-3">
              Tip: You can add multiple lines for the same color (e.g. additional requirement, wastage, or split into different shades).
            </div>
          )}
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/production-orders" })}>Cancel</Button>
        <Button onClick={save}>Save</Button>
      </div>

      {/* Pick PO dialog */}
      <Dialog open={pickPOOpen} onOpenChange={setPickPOOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Add PO — eligible POs</DialogTitle></DialogHeader>
          <Input
            placeholder="Search by PO #, client, or date..."
            value={poSearch}
            onChange={(e) => setPoSearch(e.target.value)}
            className="mb-2"
          />
          <div className="max-h-[500px] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background"><TableRow>
                <TableHead>Client</TableHead><TableHead>PO</TableHead><TableHead>PO Date</TableHead>
                <TableHead>Delivery</TableHead><TableHead>Days</TableHead>
                <TableHead>Stage</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredEligiblePOs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No eligible POs.</TableCell></TableRow>
                ) : filteredEligiblePOs.map(({ po, stage, days }) => (
                  <TableRow key={po.id} className={days < 0 ? "bg-red-50 dark:bg-red-950/20" : days <= 10 ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                    <TableCell>{cName(po.clientId)}</TableCell>
                    <TableCell className="font-mono">{po.poNumber}</TableCell>
                    <TableCell>{po.poDate}</TableCell>
                    <TableCell>{po.deliveryDate}</TableCell>
                    <TableCell>{daysRemainingLabel(days)}</TableCell>
                    <TableCell><Badge className={STAGE_BADGE[stage]} variant="secondary">{STAGE_LABEL[stage]}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => { setActivePOId(po.id); setPickPOOpen(false); }}>Select</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add new shade dialog */}
      <Dialog open={addShadeOpen !== null} onOpenChange={(o) => !o && setAddShadeOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Shade</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Supplier Shade # *</Label>
            <Input value={newShadeNo} onChange={(e) => setNewShadeNo(e.target.value)} placeholder="e.g. RED-2314" />
            <p className="text-xs text-muted-foreground">This shade will be added to the Shade Library and used immediately.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddShadeOpen(null)}>Cancel</Button>
            <Button onClick={doAddShade}>Add & Use</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OverrideToggle({ poItemId, current }: { poItemId: string; current: ProcurementStage }) {
  const override = useYarnStore((s) => s.overrides[poItemId] ?? null);
  const isYNR = override === "yarn_not_required" || current === "yarn_not_required";
  return (
    <button
      className="text-xs text-muted-foreground underline hover:text-foreground text-left"
      onClick={async () => {
        try { await yarnStore.setOverride(poItemId, isYNR ? null : "yarn_not_required"); }
        catch (e) { toast.error((e as Error).message); }
      }}
    >
      {isYNR ? "Clear override" : "Mark Yarn Not Required"}
    </button>
  );
}
