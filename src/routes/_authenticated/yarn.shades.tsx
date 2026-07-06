import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Trash2, Power } from "lucide-react";
import { useStore } from "@/lib/store";
import { useYarnStore, yarnStore } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/shades")({
  component: ShadesPage,
});

function ShadesPage() {
  const shades = useYarnStore((s) => s.shades);
  const suppliers = useYarnStore((s) => s.suppliers);
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);

  const [q, setQ] = useState("");
  const [clientF, setClientF] = useState("all");
  const [brandF, setBrandF] = useState("all");
  const [supplierF, setSupplierF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [open, setOpen] = useState(false);

  const bName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return shades.filter((s) => {
      if (clientF !== "all" && s.clientId !== clientF) return false;
      if (brandF !== "all" && s.brandId !== brandF) return false;
      if (supplierF !== "all" && s.supplierId !== supplierF) return false;
      if (statusF !== "all" && s.status !== statusF) return false;
      if (!query) return true;
      const hay = [
        s.colorName, s.material, s.supplierShadeNumber,
        cName(s.clientId), bName(s.brandId), sName(s.supplierId),
      ].join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [shades, q, clientF, brandF, supplierF, statusF, brands, clients, suppliers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Shade Library"
        subtitle="Approved yarn shades"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Shade</Button>}
      />
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div className="relative col-span-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search color, material, shade #…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={clientF} onValueChange={setClientF}>
            <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Clients</SelectItem>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={brandF} onValueChange={setBrandF}>
            <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Brands</SelectItem>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={supplierF} onValueChange={setSupplierF}>
            <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Suppliers</SelectItem>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Shade #</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No shades.</TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{cName(s.clientId)}</TableCell>
                  <TableCell>{bName(s.brandId)}</TableCell>
                  <TableCell className="font-medium">{s.colorName}</TableCell>
                  <TableCell>{s.material}</TableCell>
                  <TableCell>{sName(s.supplierId)}</TableCell>
                  <TableCell className="font-mono text-xs">{s.supplierShadeNumber}</TableCell>
                  <TableCell>{s.approvalDate}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "approved" ? "default" : "secondary"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" title="Toggle status" onClick={() => {
                        yarnStore.updateShade(s.id, { status: s.status === "approved" ? "inactive" : "approved" });
                      }}><Power className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        if (confirm("Delete this shade?")) { yarnStore.deleteShade(s.id); toast.success("Deleted"); }
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddShadeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function AddShadeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const suppliers = useYarnStore((s) => s.suppliers);
  const [clientId, setClientId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [colorName, setColorName] = useState("");
  const [material, setMaterial] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierShadeNumber, setSupplierShadeNumber] = useState("");
  const save = () => {
    if (!clientId || !brandId || !colorName.trim() || !material.trim() || !supplierId || !supplierShadeNumber.trim()) {
      toast.error("Fill all required fields"); return;
    }
    yarnStore.ensureShade({ clientId, brandId, colorName: colorName.trim(), material: material.trim(), supplierId, supplierShadeNumber: supplierShadeNumber.trim() });
    toast.success("Shade added");
    onOpenChange(false);
    setClientId(""); setBrandId(""); setColorName(""); setMaterial(""); setSupplierId(""); setSupplierShadeNumber("");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Shade</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Client *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Brand *</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Color Name *</Label><Input value={colorName} onChange={(e) => setColorName(e.target.value)} /></div>
          <div><Label>Material *</Label><Input value={material} onChange={(e) => setMaterial(e.target.value)} /></div>
          <div><Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Supplier Shade # *</Label><Input value={supplierShadeNumber} onChange={(e) => setSupplierShadeNumber(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
