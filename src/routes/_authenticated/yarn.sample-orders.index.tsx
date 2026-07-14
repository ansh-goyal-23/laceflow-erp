import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore, sampleExpectedDelivery, type SampleYarnOrder, type SampleOrderStatus } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/sample-orders/")({
  component: SampleOrdersList,
});

function SampleOrdersList() {
  const orders = useYarnStore((s) => s.sampleOrders);
  const suppliers = useYarnStore((s) => s.suppliers);
  const pos = useStore((s) => s.purchaseOrders);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<SampleYarnOrder | null>(null);
  const [deleting, setDeleting] = useState<SampleYarnOrder | null>(null);
  const [form, setForm] = useState({ orderDate: "", remarks: "", status: "ordered" as SampleOrderStatus });

  const openEdit = (o: SampleYarnOrder) => {
    setForm({ orderDate: o.orderDate, remarks: o.remarks ?? "", status: o.status });
    setEditing(o);
  };
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await yarnStore.updateSampleOrder(editing.id, {
        orderDate: form.orderDate, remarks: form.remarks, status: form.status,
      });
      toast.success("Sample order updated");
      setEditing(null);
    } catch (e) { toast.error((e as Error).message); }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await yarnStore.deleteSampleOrder(deleting.id);
      toast.success("Sample order deleted");
      setDeleting(null);
    } catch (e) { toast.error((e as Error).message); }
  };

  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const poNum = (id?: string | null) => (id ? pos.find((p) => p.id === id)?.poNumber ?? "—" : "—");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((o) => o.number.toLowerCase().includes(query) || sName(o.supplierId).toLowerCase().includes(query));
  }, [orders, q, suppliers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Sample Yarn Orders"
        subtitle="Develop new shades before production"
        actions={<Button asChild><Link to="/yarn/sample-orders/new"><Plus className="h-4 w-4 mr-1" /> New Sample Order</Link></Button>}
      />
      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search order # or supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Linked PO</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
              <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No sample orders.</TableCell></TableRow>
              ) : filtered.map((o) => {
                const approvedCount = o.items.filter((i) => i.approvalStatus === "approved").length;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.number}</TableCell>
                    <TableCell>{o.orderDate}</TableCell>
                    <TableCell>{sampleExpectedDelivery(o.orderDate)}</TableCell>
                    <TableCell>{sName(o.supplierId)}</TableCell>
                    <TableCell>{poNum(o.linkedPoId)}</TableCell>
                    <TableCell>{approvedCount}/{o.items.length} approved</TableCell>
                    <TableCell><Badge variant="secondary">{o.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" asChild title="View"><Link to="/yarn/sample-orders/$id" params={{ id: o.id }}><Eye className="h-4 w-4" /></Link></Button>
                        <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleting(o)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Sample Order {editing?.number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Order Date</Label>
              <Input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SampleOrderStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sample order {deleting?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the sample order along with its items and receipts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
