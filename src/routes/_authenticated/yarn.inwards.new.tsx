import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useYarnStore, yarnStore } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/inwards/new")({
  component: NewInward,
});

interface Row {
  colorKey: string;         // "color|material" for the color dropdown
  colorName: string;
  material: string;
  supplierShadeNumber: string;
  lotNumber: string;
  grossWeight: string;
  cones: string;
  overrideTube: boolean;
  tubeOverride: string;
  remarks: string;
}

function blankRow(): Row {
  return {
    colorKey: "", colorName: "", material: "",
    supplierShadeNumber: "", lotNumber: "",
    grossWeight: "", cones: "",
    overrideTube: false, tubeOverride: "",
    remarks: "",
  };
}

function computeNet(r: Row, supplierTube: number): number {
  const g = Number(r.grossWeight) || 0;
  const c = Number(r.cones) || 0;
  const t = r.overrideTube ? (Number(r.tubeOverride) || 0) : supplierTube;
  return Math.max(0, g - c * t);
}

function NewInward() {
  const nav = useNavigate();
  const suppliers = useYarnStore((s) => s.suppliers);
  const prodOrders = useYarnStore((s) => s.productionOrders);
  const sampleOrders = useYarnStore((s) => s.sampleOrders);
  const [inwardDate, setInwardDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [challan, setChallan] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow()]);

  const supplier = useMemo(() => suppliers.find((s) => s.id === supplierId), [suppliers, supplierId]);
  const defaultTube = supplier?.defaultPaperTubeWeight ?? 0;

  const onSupplierChange = (v: string) => {
    setSupplierId(v);
    // Reset colors: pending colors change with supplier
    setRows((rs) => rs.map((r) => ({ ...r, colorKey: "", colorName: "", material: "", supplierShadeNumber: "" })));
  };

  // Pending colors for this supplier (from prod + sample orders with remaining qty)
  const pendingColors = useMemo(() => {
    if (!supplierId) return [] as { key: string; color: string; material: string; source: "production" | "sample" | "both" }[];
    const map = new Map<string, { key: string; color: string; material: string; source: "production" | "sample" | "both" }>();
    for (const o of prodOrders) {
      if (o.supplierId !== supplierId || o.status === "cancelled") continue;
      for (const it of o.items) {
        if (it.receivedQty + 0.0001 >= it.orderedQty) continue;
        const k = `${it.colorName}|${it.material}`;
        const ex = map.get(k);
        if (!ex) map.set(k, { key: k, color: it.colorName, material: it.material, source: "production" });
        else if (ex.source === "sample") ex.source = "both";
      }
    }
    for (const o of sampleOrders) {
      if (o.supplierId !== supplierId) continue;
      if (o.status === "cancelled" || o.status === "completed") continue;
      for (const it of o.items) {
        if (it.approvalStatus === "approved") continue;
        const k = `${it.colorName}|${it.material}`;
        const ex = map.get(k);
        if (!ex) map.set(k, { key: k, color: it.colorName, material: it.material, source: "sample" });
        else if (ex.source === "production") ex.source = "both";
      }
    }
    return Array.from(map.values()).sort((a, b) => a.color.localeCompare(b.color));
  }, [supplierId, prodOrders, sampleOrders]);

  // Existing shades for a given row (supplier + color): drives combobox suggestions
  const suggestedShades = (r: Row): string[] => {
    if (!supplierId || !r.colorName) return [];
    const set = new Set<string>();
    for (const o of prodOrders) {
      if (o.supplierId !== supplierId || o.status === "cancelled") continue;
      for (const it of o.items) {
        if (it.receivedQty + 0.0001 >= it.orderedQty) continue;
        if (it.colorName.trim().toLowerCase() !== r.colorName.trim().toLowerCase()) continue;
        if (it.material.trim().toLowerCase() !== r.material.trim().toLowerCase()) continue;
        if (it.supplierShadeNumber) set.add(it.supplierShadeNumber);
      }
    }
    return Array.from(set).sort();
  };

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const rowIsSample = (r: Row): boolean => {
    if (!r.supplierShadeNumber.trim() || !r.colorName) return false;
    const suggestions = suggestedShades(r).map((s) => s.trim().toLowerCase());
    return !suggestions.includes(r.supplierShadeNumber.trim().toLowerCase());
  };

  const submit = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const cleaned = rows.filter((r) => r.supplierShadeNumber.trim() && r.colorName && (Number(r.grossWeight) || 0) > 0);
    if (!cleaned.length) { toast.error("Add at least one row with shade # and gross weight"); return; }

    const productionRows: Row[] = [];
    const sampleRows: Row[] = [];
    for (const r of cleaned) (rowIsSample(r) ? sampleRows : productionRows).push(r);

    try {
      // 1) Production inward — through existing flow (goes to Pending Allocation)
      if (productionRows.length) {
        await yarnStore.addInward({
          inwardDate, supplierId,
          supplierChallanNumber: challan.trim(),
          remarks: remarks.trim() || undefined,
          items: productionRows.map((r) => ({
            supplierShadeNumber: r.supplierShadeNumber.trim(),
            lotNumber: r.lotNumber.trim() || undefined,
            grossWeight: Number(r.grossWeight) || 0,
            cones: Number(r.cones) || 0,
            paperTubeWeight: r.overrideTube ? (Number(r.tubeOverride) || 0) : defaultTube,
            remarks: r.remarks.trim() || undefined,
          })),
        });
      }

      // 2) Sample rows — attach as sample receipts on the matching pending Sample Order
      let sampleAttached = 0;
      let sampleUnmatched = 0;
      for (const r of sampleRows) {
        const match = sampleOrders.find((o) =>
          o.supplierId === supplierId &&
          o.status !== "cancelled" && o.status !== "completed" &&
          o.items.some((i) =>
            i.approvalStatus !== "approved" &&
            i.colorName.trim().toLowerCase() === r.colorName.trim().toLowerCase() &&
            i.material.trim().toLowerCase() === r.material.trim().toLowerCase(),
          ),
        );
        if (!match) { sampleUnmatched++; continue; }
        await yarnStore.addSampleReceipt(match.id, {
          receiptDate: inwardDate,
          supplierShadeNumber: r.supplierShadeNumber.trim(),
          lotNumber: r.lotNumber.trim() || undefined,
          grossWeight: Number(r.grossWeight) || 0,
          cones: Number(r.cones) || 0,
          remarks: r.remarks.trim() || undefined,
        });
        sampleAttached++;
      }

      const msgs: string[] = [];
      if (productionRows.length) msgs.push(`${productionRows.length} production line(s) saved`);
      if (sampleAttached) msgs.push(`${sampleAttached} sample receipt(s) linked`);
      if (sampleUnmatched) msgs.push(`${sampleUnmatched} sample row(s) had no pending sample order — skipped`);
      toast.success(msgs.join(" · ") || "Saved");
      nav({ to: "/yarn/inwards" });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4">
      <PageHeader
        title="New Yarn Inward"
        subtitle="Store dept: record physical yarn received. Procurement handles allocation later."
      />

      <Card className="p-4 grid md:grid-cols-3 gap-3">
        <div>
          <Label>Inward Number</Label>
          <Input value="Auto-generated (INW-YYYY-####)" disabled />
        </div>
        <div><Label>Inward Date</Label><Input type="date" value={inwardDate} onChange={(e) => setInwardDate(e.target.value)} /></div>
        <div>
          <Label>Supplier *</Label>
          <Select value={supplierId} onValueChange={onSupplierChange}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          {supplierId && (
            <p className="text-xs text-muted-foreground mt-1">Paper tube: {defaultTube ? `${defaultTube} Kg / cone (from supplier master)` : "Not set in supplier master"}</p>
          )}
        </div>
        <div className="md:col-span-2"><Label>Supplier Challan Number</Label><Input value={challan} onChange={(e) => setChallan(e.target.value)} /></div>
        <div className="md:col-span-3"><Label>Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Inward Items</div>
          <Button variant="outline" size="sm" onClick={addRow} disabled={!supplierId}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="min-w-[180px]">Color *</TableHead>
              <TableHead>Supplier Shade # *</TableHead>
              <TableHead>Lot #</TableHead>
              <TableHead>Gross Wt (Kg) *</TableHead>
              <TableHead>Cones</TableHead>
              <TableHead>Net Wt (Kg)</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const listId = `shades-${i}`;
                const suggestions = suggestedShades(r);
                const isSample = rowIsSample(r);
                return (
                  <Fragment key={i}>
                    <TableRow>
                      <TableCell>
                        <Select value={r.colorKey} onValueChange={(v) => {
                          const [colorName, material] = v.split("|");
                          updateRow(i, { colorKey: v, colorName, material, supplierShadeNumber: "" });
                        }} disabled={!supplierId}>
                          <SelectTrigger><SelectValue placeholder={pendingColors.length ? "Select color" : "No pending colors"} /></SelectTrigger>
                          <SelectContent>
                            {pendingColors.map((c) => (
                              <SelectItem key={c.key} value={c.key}>{c.color} · {c.material}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          list={listId}
                          value={r.supplierShadeNumber}
                          onChange={(e) => updateRow(i, { supplierShadeNumber: e.target.value })}
                          placeholder={r.colorName ? "Pick or type shade #" : "Select color first"}
                          disabled={!r.colorName}
                        />
                        <datalist id={listId}>
                          {suggestions.map((s) => <option key={s} value={s} />)}
                        </datalist>
                      </TableCell>
                      <TableCell><Input value={r.lotNumber} onChange={(e) => updateRow(i, { lotNumber: e.target.value })} /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={r.grossWeight} onChange={(e) => updateRow(i, { grossWeight: e.target.value })} /></TableCell>
                      <TableCell><Input type="number" value={r.cones} onChange={(e) => updateRow(i, { cones: e.target.value })} /></TableCell>
                      <TableCell className="font-medium">{computeNet(r, defaultTube).toFixed(2)}</TableCell>
                      <TableCell>
                        {r.supplierShadeNumber
                          ? <span className={`text-xs px-2 py-0.5 rounded ${isSample ? "bg-purple-500/10 text-purple-700 dark:text-purple-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{isSample ? "Sample" : "Production"}</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><Input value={r.remarks} onChange={(e) => updateRow(i, { remarks: e.target.value })} /></TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => removeRow(i)} disabled={rows.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                    <TableRow className="border-t-0">
                      <TableCell colSpan={9} className="py-1 bg-muted/20">
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <Switch checked={r.overrideTube} onCheckedChange={(c) => updateRow(i, { overrideTube: c })} />
                            <Label className="text-xs">Override paper tube weight for this row</Label>
                          </div>
                          {r.overrideTube && (
                            <Input
                              type="number" step="0.001"
                              className="h-7 w-32"
                              placeholder="Kg / cone"
                              value={r.tubeOverride}
                              onChange={(e) => updateRow(i, { tubeOverride: e.target.value })}
                            />
                          )}
                          <span className="text-muted-foreground ml-auto">
                            Tube used: {(r.overrideTube ? (Number(r.tubeOverride) || 0) : defaultTube).toFixed(3)} Kg/cone
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          Net = Gross − Cones × Paper Tube Wt. Tube weight comes from Supplier Master; use the row override only for exceptions.
          <br />
          Pick an existing shade → <b>Production Receipt</b> (goes to allocation). Type a new shade → <b>Sample Receipt</b> (linked to the pending sample order).
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/inwards" })}>Cancel</Button>
        <Button onClick={submit}>Save Inward</Button>
      </div>
    </div>
  );
}