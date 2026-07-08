import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore, type ProductionOrderStatus } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/production-orders/$id")({
  component: ProdOrderDetail,
});

function ProdOrderDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const order = useYarnStore((s) => s.productionOrders.find((o) => o.id === id));
  const suppliers = useYarnStore((s) => s.suppliers);
  const shades = useYarnStore((s) => s.shades);
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({ orderDate: "", remarks: "", status: "ordered" as ProductionOrderStatus });
  if (!order) return <div className="p-6 text-sm text-muted-foreground">Not found. <button onClick={() => nav({ to: "/yarn/production-orders" })} className="underline">Back</button></div>;

  const supplier = suppliers.find((s) => s.id === order.supplierId);
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const poNum = (id: string) => pos.find((p) => p.id === id)?.poNumber ?? "—";
  const shade = (id?: string | null) => shades.find((s) => s.id === id);

  const openEdit = () => {
    setForm({ orderDate: order.orderDate, remarks: order.remarks ?? "", status: order.status });
    setEditing(true);
  };
  const saveEdit = async () => {
    try {
      await yarnStore.updateProductionOrder(order.id, { orderDate: form.orderDate, remarks: form.remarks, status: form.status });
      toast.success("Updated");
      setEditing(false);
    } catch (e) { toast.error((e as Error).message); }
  };
  const confirmDelete = async () => {
    try {
      await yarnStore.deleteProductionOrder(order.id);
      toast.success("Deleted");
      nav({ to: "/yarn/production-orders" });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4">
      <PageHeader
        title={`Production Order ${order.number}`}
        subtitle={supplier?.name}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild><Link to="/yarn/production-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
            <Button variant="outline" onClick={openEdit}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
            <Button variant="outline" onClick={() => setDeleting(true)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
          </div>
        }
      />
      <Card className="p-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><div className="text-muted-foreground">Order Date</div><div className="font-medium">{order.orderDate}</div></div>
        <div><div className="text-muted-foreground">Supplier</div><div className="font-medium">{supplier?.name ?? "—"}</div></div>
        <div><div className="text-muted-foreground">Status</div><Badge variant="secondary">{order.status.replace("_", " ")}</Badge></div>
        <div><div className="text-muted-foreground">Items</div><div className="font-medium">{order.items.length}</div></div>
        {order.remarks && <div className="md:col-span-4"><div className="text-muted-foreground">Remarks</div>{order.remarks}</div>}
      </Card>
      <Card className="p-4">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>PO</TableHead><TableHead>Material</TableHead>
              <TableHead>Color</TableHead><TableHead>Shade #</TableHead>
              <TableHead>Ordered (Kg)</TableHead><TableHead>Received (Kg)</TableHead><TableHead>Pending</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {order.items.map((it) => {
                const s = shade(it.approvedShadeId);
                return (
                  <TableRow key={it.id}>
                    <TableCell>{cName(it.clientId)}</TableCell>
                    <TableCell className="font-mono">{poNum(it.poId)}</TableCell>
                    <TableCell>{it.material}</TableCell>
                    <TableCell>{it.colorName}</TableCell>
                    <TableCell className="font-mono text-xs">{it.supplierShadeNumber || s?.supplierShadeNumber || "—"}</TableCell>
                    <TableCell>{it.orderedQty}</TableCell>
                    <TableCell>{it.receivedQty}</TableCell>
                    <TableCell className="font-medium">{Math.max(0, it.orderedQty - it.receivedQty).toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Production Order {order.number}</DialogTitle></DialogHeader>
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
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete production order {order.number}?</AlertDialogTitle>
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
