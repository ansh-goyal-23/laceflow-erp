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
import { Plus, Search, Eye, Pencil, Trash2, CheckCircle2, RefreshCw } from "lucide-react";
import { useYarnStore, yarnStore, sampleExpectedDelivery, type SampleYarnOrder, type SampleOrderStatus } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function statusLabel(s: SampleOrderStatus): string {
  return s === "received" ? "Approval Needed" : s.charAt(0).toUpperCase() + s.slice(1);
}

function daysSince(dateISO: string): number {
  const d = new Date(dateISO).getTime();
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / (24 * 3600 * 1000)));
}

export const Route = createFileRoute("/_authenticated/yarn/sample-orders/")({
  component: SampleOrdersList,
});

function SampleOrdersList() {
  const orders = useYarnStore((s) => s.sampleOrders);
  const suppliers = useYarnStore((s) => s.suppliers);
  const inwards = useYarnStore((s) => s.inwards);
  const clients = useStore((s) => s.clients);
  const brands = useStore((s) => s.brands);
  const pos = useStore((s) => s.purchaseOrders);
  const [q, setQ] = useState("");
  const [approveFor, setApproveFor] = useState<{ orderId: string; itemId: string } | null>(null);
  const [shadeNo, setShadeNo] = useState("");
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
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const bName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter((o) => o.number.toLowerCase().includes(query) || sName(o.supplierId).toLowerCase().includes(query));
  }, [orders, q, suppliers]);

  // Approvals Needed queue: sample orders that have received yarn and still have
  // at least one pending item awaiting customer approval.
  const approvalRows = useMemo(() => {
    const list: Array<{
      orderId: string; orderNumber: string;
      supplier: string; client: string; brand: string;
      linkedPo: string;
      itemId: string; colorName: string; material: string;
      supplierShadeNumber: string;
      receiptDate: string; netWeight: number;
      daysSince: number;
    }> = [];
    for (const o of orders) {
      if (o.status !== "received") continue;
      const receipt = o.receipts[o.receipts.length - 1];
      if (!receipt) continue;
      // Prefer the exact net from the mirrored inward item; fall back to gross - cones * supplier tube.
      const inwItem = (() => {
        for (const iw of inwards) {
          if (iw.supplierId !== o.supplierId || iw.inwardDate !== receipt.receiptDate) continue;
          const it = iw.items.find((i) =>
            (i.supplierShadeNumber || "").trim().toLowerCase() === (receipt.supplierShadeNumber || "").trim().toLowerCase() &&
            (i.lotNumber || "").trim().toLowerCase() === (receipt.lotNumber || "").trim().toLowerCase() &&
            Math.abs(i.grossWeight - receipt.grossWeight) < 0.01 &&
            Math.abs(i.cones - receipt.cones) < 0.5,
          );
          if (it) return it;
        }
        return undefined;
      })();
      const sup = suppliers.find((s) => s.id === o.supplierId);
      const tube = sup?.defaultPaperTubeWeight ?? 0;
      const net = inwItem
        ? inwItem.netWeight
        : Math.max(0, receipt.grossWeight - receipt.cones * tube);
      for (const it of o.items) {
        if (it.approvalStatus !== "pending") continue;
        list.push({
          orderId: o.id, orderNumber: o.number,
          supplier: sName(o.supplierId),
          client: cName(it.clientId), brand: bName(it.brandId),
          linkedPo: poNum(o.linkedPoId),
          itemId: it.id, colorName: it.colorName, material: it.material,
          supplierShadeNumber: receipt.supplierShadeNumber || "",
          receiptDate: receipt.receiptDate,
          netWeight: net,
          daysSince: daysSince(receipt.receiptDate),
        });
      }
    }
    return list.sort((a, b) => b.daysSince - a.daysSince);
  }, [orders, suppliers, clients, brands, pos]);

  const doApprove = async () => {
    if (!approveFor || !shadeNo.trim()) { toast.error("Enter supplier shade #"); return; }
    try {
      await yarnStore.approveSampleItem(approveFor.orderId, approveFor.itemId, shadeNo.trim());
      toast.success("Approved — shade added to library");
      setApproveFor(null); setShadeNo("");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Sample Yarn Orders"
        subtitle="Develop new shades before production"
        actions={<Button asChild><Link to="/yarn/sample-orders/new"><Plus className="h-4 w-4 mr-1" /> New Sample Order</Link></Button>}
      />
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Orders</TabsTrigger>
          <TabsTrigger value="approvals">
            Approvals Needed{approvalRows.length ? ` (${approvalRows.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
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
                    <TableCell>
                      <Badge variant={o.status === "received" ? "default" : "secondary"}
                        className={o.status === "received" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25" : ""}>
                        {statusLabel(o.status)}
                      </Badge>
                    </TableCell>
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
        </TabsContent>

        <TabsContent value="approvals">
          <Card className="p-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Sample Order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Linked PO</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Shade #</TableHead>
                  <TableHead>Receipt Date</TableHead>
                  <TableHead>Net (Kg)</TableHead>
                  <TableHead>Days Since</TableHead>
                  <TableHead className="w-[160px]">Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {approvalRows.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No pending approvals.</TableCell></TableRow>
                  ) : approvalRows.map((r) => (
                    <TableRow key={`${r.orderId}-${r.itemId}`}>
                      <TableCell className="font-mono">
                        <Link to="/yarn/sample-orders/$id" params={{ id: r.orderId }} className="hover:underline">{r.orderNumber}</Link>
                      </TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell>{r.client}</TableCell>
                      <TableCell>{r.brand}</TableCell>
                      <TableCell>{r.linkedPo}</TableCell>
                      <TableCell className="font-medium">{r.colorName}</TableCell>
                      <TableCell>{r.material}</TableCell>
                      <TableCell className="font-mono text-xs">{r.supplierShadeNumber || "—"}</TableCell>
                      <TableCell>{r.receiptDate}</TableCell>
                      <TableCell>{r.netWeight ? r.netWeight.toFixed(2) : "—"}</TableCell>
                      <TableCell>{r.daysSince}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => { setApproveFor({ orderId: r.orderId, itemId: r.itemId }); setShadeNo(r.supplierShadeNumber || ""); }}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            try { await yarnStore.redyeSampleItem(r.orderId, r.itemId); toast.success("Marked for re-dye"); }
                            catch (e) { toast.error((e as Error).message); }
                          }}>
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Redye
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!approveFor} onOpenChange={(o) => !o && setApproveFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Sample</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Supplier Shade # *</Label>
            <Input value={shadeNo} onChange={(e) => setShadeNo(e.target.value)} placeholder="e.g. RED-2314" />
            <p className="text-xs text-muted-foreground">Approving will add this shade to the Shade Library.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveFor(null)}>Cancel</Button>
            <Button onClick={doApprove}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
