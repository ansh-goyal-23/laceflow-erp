import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Pencil, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore, type YarnSupplier } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/suppliers")({
  component: SuppliersPage,
});

const empty = { name: "", contactPerson: "", mobile: "", email: "", address: "", gst: "", remarks: "" };

function SuppliersPage() {
  const suppliers = useYarnStore((s) => s.suppliers);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<YarnSupplier | null>(null);
  const [form, setForm] = useState({ ...empty });

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return suppliers;
    return suppliers.filter((s) =>
      [s.name, s.contactPerson, s.mobile, s.email, s.gst].some((v) => (v || "").toLowerCase().includes(query)),
    );
  }, [suppliers, q]);

  const openAdd = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const openEdit = (s: YarnSupplier) => {
    setEditing(s);
    setForm({
      name: s.name, contactPerson: s.contactPerson, mobile: s.mobile,
      email: s.email, address: s.address, gst: s.gst, remarks: s.remarks,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return; }
    try {
      if (editing) { await yarnStore.updateSupplier(editing.id, form); toast.success("Supplier updated"); }
      else { await yarnStore.addSupplier(form); toast.success("Supplier added"); }
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Supplier Master"
        subtitle="Manage yarn dyeing suppliers"
        actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Supplier</Button>}
      />
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search name, contact, mobile, GST…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>GST</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No suppliers.</TableCell></TableRow>
              ) : filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contactPerson || "—"}</TableCell>
                  <TableCell>{s.mobile || "—"}</TableCell>
                  <TableCell>{s.email || "—"}</TableCell>
                  <TableCell>{s.gst || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={async () => {
                        if (!confirm(`Delete supplier "${s.name}"?`)) return;
                        try { await yarnStore.deleteSupplier(s.id); toast.success("Deleted"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
            <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
            <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>GST</Label><Input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} /></div>
            <div className="col-span-2"><Label>Remarks</Label><Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
