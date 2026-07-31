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
import {
  useYarnStore, yarnStore, inwardItemAllocatedQty, inwardItemContext,
} from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/inwards/$id/edit")({
  component: EditInward,
});

interface Row {
  id?: string;
  colorLabel: string;
  supplierShadeNumber: string;
  lotNumber: string;
  grossWeight: string;
  cones: string;
  paperTubeWeight: string;
  remarks: string;
  allocated: number;
}

function net(r: Row): number {
  return Math.max(0, (Number(r.grossWeight) || 0) - (Number(r.cones) || 0) * (Number(r.paperTubeWeight) || 0));
}

function EditInward() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const inward = useYarnStore((s) => s.inwards.find((r) => r.id === id));
  const suppliers = useYarnStore((s) => s.suppliers);
  const store = useYarnStore((s) => s);

  const initial = useMemo(() => {
    if (!inward) return null;
    return {
      inwardDate: inward.inwardDate,
      supplierId: inward.supplierId,
      challan: inward.supplierChallanNumber ?? "",
      remarks: inward.remarks ?? "",
      rows: inward.items.map<Row>((it) => ({
        id: it.id,
        colorLabel: inwardItemContext(store, inward, it).colorName || "—",
        supplierShadeNumber: it.supplierShadeNumber,
        lotNumber: it.lotNumber ?? "",
        grossWeight: String(it.grossWeight),
        cones: String(it.cones),
        paperTubeWeight: String(it.paperTubeWeight),
        remarks: it.remarks ?? "",
        allocated: inwardItemAllocatedQty(it),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inward?.id]);

  const [inwardDate, setInwardDate] = useState(initial?.inwardDate ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [challan, setChallan] = useState(initial?.challan ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [rows, setRows] = useState<Row[]>(initial?.rows ?? []);
  const [saving, setSaving] = useState(false);

  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (!inward || !initial) return;
    if (loadedId.current === inward.id) return;
    loadedId.current = inward.id;
    setInwardDate(initial.inwardDate);
    setSupplierId(initial.supplierId);
    setChallan(initial.challan);
    setRemarks(initial.remarks);
    setRows(initial.rows);
  }, [inward, initial]);

  if (!inward || !initial) {
    return <div className="p-6 text-sm text-muted-foreground">Not found. <button onClick={() => nav({ to: "/yarn/inwards" })} className="underline">Back</button></div>;
  }

  const supplier = suppliers.find((s) => s.id === supplierId);
  const defaultTube = supplier?.defaultPaperTubeWeight ?? 0;
  const supplierLocked = rows.some((r) => r.allocated > 0.0001);

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const addRow = () => setRows((rs) => [...rs, {
    colorLabel: "New row", supplierShadeNumber: "", lotNumber: "",
    grossWeight: "", cones: "", paperTubeWeight: String(defaultTube),
    remarks: "", allocated: 0,
  }]);

  const save = async () => {
    if (saving) return;
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const cleaned = rows.filter((r) => r.supplierShadeNumber.trim() && (Number(r.grossWeight) || 0) > 0);
    if (!cleaned.length) { toast.error("Keep at least one row with shade # and gross weight"); return; }
    setSaving(true);
    try {
      await yarnStore.updateInwardFull(inward.id, {
        inwardDate, supplierId,
        supplierChallanNumber: challan.trim(),
        remarks: remarks.trim() || undefined,
        items: cleaned.map((r) => ({
          id: r.id,
          supplierShadeNumber: r.supplierShadeNumber.trim(),
          lotNumber: r.lotNumber.trim() || undefined,
          grossWeight: Number(r.grossWeight) || 0,
          cones: Number(r.cones) || 0,
          paperTubeWeight: Number(r.paperTubeWeight) || 0,
          remarks: r.remarks.trim() || undefined,
        })),
      });
      toast.success("Inward updated");
      nav({ to: "/yarn/inwards/$id", params: { id: inward.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4">
      <PageHeader title={`Edit Yarn Inward ${inward.number}`} subtitle="Header and item rows. Allocated rows are partially locked." />

      <Card className="p-4 grid md:grid-cols-3 gap-3">
        <div><Label>Inward Date</Label><Input type="date" value={inwardDate} onChange={(e) => setInwardDate(e.target.value)} /></div>
        <div>
          <Label>Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId} disabled={supplierLocked}>
            <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
            <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          {supplierLocked && <p className="text-xs text-muted-foreground mt-1">Locked — rows are allocated.</p>}
        </div>
        <div><Label>Supplier Challan Number</Label><Input value={challan} onChange={(e) => setChallan(e.target.value)} /></div>
        <div className="md:col-span-3"><Label>Remarks</Label><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Inward Items</div>
          <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-4 w-4 mr-1" /> Add Row</Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Supplier Shade # *</TableHead>
              <TableHead>Lot #</TableHead>
              <TableHead>Gross Wt (Kg) *</TableHead>
              <TableHead>Cones</TableHead>
              <TableHead>Tube Wt</TableHead>
              <TableHead>Net Wt (Kg)</TableHead>
              <TableHead>Allocated</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const locked = r.allocated > 0.0001;
                const below = net(r) + 0.0001 < r.allocated;
                return (
                  <TableRow key={r.id ?? `new-${i}`}>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        {r.colorLabel}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input value={r.supplierShadeNumber} disabled={locked}
                        onChange={(e) => patch(i, { supplierShadeNumber: e.target.value })} />
                    </TableCell>
                    <TableCell><Input value={r.lotNumber} onChange={(e) => patch(i, { lotNumber: e.target.value })} /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={r.grossWeight} onChange={(e) => patch(i, { grossWeight: e.target.value })} /></TableCell>
                    <TableCell><Input type="number" value={r.cones} onChange={(e) => patch(i, { cones: e.target.value })} /></TableCell>
                    <TableCell><Input type="number" step="0.001" className="w-24" value={r.paperTubeWeight} onChange={(e) => patch(i, { paperTubeWeight: e.target.value })} /></TableCell>
                    <TableCell className={below ? "font-medium text-destructive" : "font-medium"}>{net(r).toFixed(2)}</TableCell>
                    <TableCell>{r.allocated.toFixed(2)}</TableCell>
                    <TableCell><Input value={r.remarks} onChange={(e) => patch(i, { remarks: e.target.value })} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" disabled={locked || rows.length === 1}
                        title={locked ? "Allocated rows cannot be deleted" : "Delete row"}
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
        <div className="text-sm text-muted-foreground mt-2">
          Net = Gross − Cones × Paper Tube Wt. Net weight cannot go below the allocated quantity, and allocated rows keep their shade #.
          Rows linked to a sample order stay linked — their sample receipt is updated with the new values.
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/inwards/$id", params: { id: inward.id } })}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
      </div>
    </div>
  );
}