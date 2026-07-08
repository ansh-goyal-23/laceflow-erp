import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/inwards/new")({
  component: NewInward,
});

interface Row {
  supplierShadeNumber: string;
  lotNumber: string;
  grossWeight: string;
  cones: string;
  paperTubeWeight: string;
  remarks: string;
}

function blankRow(defaultTube: number): Row {
  return {
    supplierShadeNumber: "", lotNumber: "",
    grossWeight: "", cones: "",
    paperTubeWeight: defaultTube ? String(defaultTube) : "",
    remarks: "",
  };
}

function computeNet(r: Row): number {
  const g = Number(r.grossWeight) || 0;
  const c = Number(r.cones) || 0;
  const t = Number(r.paperTubeWeight) || 0;
  return Math.max(0, g - c * t);
}

function NewInward() {
  const nav = useNavigate();
  const suppliers = useYarnStore((s) => s.suppliers);
  const [inwardDate, setInwardDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [challan, setChallan] = useState("");
  const [remarks, setRemarks] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow(0)]);

  const supplier = useMemo(() => suppliers.find((s) => s.id === supplierId), [suppliers, supplierId]);
  const defaultTube = supplier?.defaultPaperTubeWeight ?? 0;

  const onSupplierChange = (v: string) => {
    setSupplierId(v);
    const s = suppliers.find((x) => x.id === v);
    const tube = s?.defaultPaperTubeWeight ?? 0;
    setRows((rs) => rs.map((r) => (r.paperTubeWeight ? r : { ...r, paperTubeWeight: tube ? String(tube) : "" })));
  };

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow(defaultTube)]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    const cleaned = rows.filter((r) => r.supplierShadeNumber.trim() && (Number(r.grossWeight) || 0) > 0);
    if (!cleaned.length) { toast.error("Add at least one row with shade # and gross weight"); return; }
    try {
      await yarnStore.addInward({
        inwardDate, supplierId,
        supplierChallanNumber: challan.trim(),
        remarks: remarks.trim() || undefined,
        items: cleaned.map((r) => ({
          supplierShadeNumber: r.supplierShadeNumber.trim(),
          lotNumber: r.lotNumber.trim() || undefined,
          grossWeight: Number(r.grossWeight) || 0,
          cones: Number(r.cones) || 0,
          paperTubeWeight: Number(r.paperTubeWeight) || 0,
          remarks: r.remarks.trim() || undefined,
        })),
      });
      toast.success("Yarn inward saved. Procurement can now allocate it.");
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
        </div>
        <div className="md:col-span-2"><Label>Supplier Challan Number</Label><Input value={challan} onChange={(e) => setChallan(e.target.value)} /></div>
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
              <TableHead>Supplier Shade # *</TableHead>
              <TableHead>Lot #</TableHead>
              <TableHead>Gross Wt (Kg) *</TableHead>
              <TableHead>Cones</TableHead>
              <TableHead>Paper Tube Wt / Cone</TableHead>
              <TableHead>Net Wt (Kg)</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell><Input value={r.supplierShadeNumber} onChange={(e) => updateRow(i, { supplierShadeNumber: e.target.value })} /></TableCell>
                  <TableCell><Input value={r.lotNumber} onChange={(e) => updateRow(i, { lotNumber: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" step="0.01" value={r.grossWeight} onChange={(e) => updateRow(i, { grossWeight: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" value={r.cones} onChange={(e) => updateRow(i, { cones: e.target.value })} /></TableCell>
                  <TableCell><Input type="number" step="0.001" value={r.paperTubeWeight} onChange={(e) => updateRow(i, { paperTubeWeight: e.target.value })} /></TableCell>
                  <TableCell className="font-medium">{computeNet(r).toFixed(2)}</TableCell>
                  <TableCell><Input value={r.remarks} onChange={(e) => updateRow(i, { remarks: e.target.value })} /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => removeRow(i)} disabled={rows.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="text-sm text-muted-foreground mt-2">
          Net = Gross − Cones × Paper Tube Wt. ERP uses Net for all procurement calculations.
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav({ to: "/yarn/inwards" })}>Cancel</Button>
        <Button onClick={submit}>Save Inward</Button>
      </div>
    </div>
  );
}