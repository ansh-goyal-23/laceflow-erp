import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore, type ProductionYarnOrder, type ProductionOrderStatus } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/production-orders/")({
  component: ProdOrdersList,
});

function ProdOrdersList() {
  const orders = useYarnStore((s) => s.productionOrders);
  const suppliers = useYarnStore((s) => s.suppliers);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ProductionYarnOrder | null>(null);
  const [deleting, setDeleting] = useState<ProductionYarnOrder | null>(null);
  const [form, setForm] = useState({ orderDate: "", remarks: "", status: "ordered" as ProductionOrderStatus });

  const openEdit = (o: ProductionYarnOrder) => {
    setForm({ orderDate: o.orderDate, remarks: o.remarks ?? "", status: o.status });
    setEditing(o);
  };
  const saveEdit = async () => {
    if (!editing) return;
    try {
      await yarnStore.updateProductionOrder(editing.id, {
        orderDate: form.orderDate, remarks: form.remarks, status: form.status,
      });
      toast.success("Production order updated");
      setEditing(null);
    } catch (e) { toast.error((e as Error).message); }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await yarnStore.deleteProductionOrder(deleting.id);
      toast.success("Production order deleted");
      setDeleting(null);
    } catch (e) { toast.error((e as Error).message); }
  };

  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((o) => o.number.toLowerCase().includes(query) || sName(o.supplierId).toLowerCase().includes(query));
  }, [orders, q, suppliers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Production Yarn Orders"
        subtitle="Yarn ordered from dyeing suppliers"
        actions={<Button asChild><Link to="/yarn/production-orders/new"><Plus className="h-4 w-4 mr-1" /> New Production Order</Link></Button>}
      />
      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search order # or supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Order #</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Items</TableHead><TableHead>Ordered (Kg)</TableHead><TableHead>Received (Kg)</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-[140px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No production yarn orders.</TableCell></TableRow>
              ) : filtered.map((o) => {
                const ordered = o.items.reduce((s, i) => s + i.orderedQty, 0);
                const recv = o.items.reduce((s, i) => s + i.receivedQty, 0);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono">{o.number}</TableCell>
                    <TableCell>{o.orderDate}</TableCell>
                    <TableCell>{sName(o.supplierId)}</TableCell>
                    <TableCell>{o.items.length}</TableCell>
                    <TableCell>{ordered.toFixed(2)}</TableCell>
                    <TableCell>{recv.toFixed(2)}</TableCell>
                    <TableCell><Badge variant="secondary">{o.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" asChild title="View"><Link to="/yarn/production-orders/$id" params={{ id: o.id }}><Eye className="h-4 w-4" /></Link></Button>
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
          <DialogHeader><DialogTitle>Edit Production Order {editing?.number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Order Date</Label>
              <Input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ProductionOrderStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ordered">Ordered</SelectItem>
                  <SelectItem value="partially_received">Partially Received</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
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
            <AlertDialogTitle>Delete production order {deleting?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the order and any related allocations. Inward yarn allocated to it will become unallocated again. This action cannot be undone.
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
