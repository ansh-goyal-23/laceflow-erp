import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, Printer, CheckCircle2, RefreshCw, PackagePlus } from "lucide-react";
import { useYarnStore, yarnStore, sampleExpectedDelivery } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/sample-orders/")({
  component: SampleOrderDetail,
});

function SampleOrderDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const order = useYarnStore((s) => s.sampleOrders.find((o) => o.id === id));
  const suppliers = useYarnStore((s) => s.suppliers);
  const clients = useStore((s) => s.clients);
  const brands = useStore((s) => s.brands);
  const pos = useStore((s) => s.purchaseOrders);
  const [approveFor, setApproveFor] = useState<string | null>(null);
  const [shadeNo, setShadeNo] = useState("");
  const [rcpOpen, setRcpOpen] = useState(false);
  const [rcp, setRcp] = useState({ receiptDate: new Date().toISOString().slice(0, 10), supplierShadeNumber: "", lotNumber: "", grossWeight: "", cones: "", remarks: "" });

  if (!order) return <div className="p-6 text-sm text-muted-foreground">Sample order not found. <button onClick={() => nav({ to: "/yarn/sample-orders" })} className="underline">Back</button></div>;

  const supplier = suppliers.find((s) => s.id === order.supplierId);
  const po = order.linkedPoId ? pos.find((p) => p.id === order.linkedPoId) : null;
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const bName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  const doApprove = () => {
    if (!approveFor || !shadeNo.trim()) { toast.error("Enter supplier shade #"); return; }
    yarnStore.approveSampleItem(order.id, approveFor, shadeNo.trim());
    toast.success("Approved — shade added to library");
    setApproveFor(null); setShadeNo("");
  };

  const saveReceipt = () => {
    if (!rcp.grossWeight) { toast.error("Enter gross weight"); return; }
    yarnStore.addSampleReceipt(order.id, {
      receiptDate: rcp.receiptDate,
      supplierShadeNumber: rcp.supplierShadeNumber,
      lotNumber: rcp.lotNumber || undefined,
      grossWeight: Number(rcp.grossWeight) || 0,
      cones: Number(rcp.cones) || 0,
      remarks: rcp.remarks || undefined,
    });
    toast.success("Receipt saved");
    setRcpOpen(false);
    setRcp({ receiptDate: new Date().toISOString().slice(0, 10), supplierShadeNumber: "", lotNumber: "", grossWeight: "", cones: "", remarks: "" });
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4 print:p-0 print:max-w-none">
      <div className="print:hidden">
        <PageHeader
          title={`Sample Order ${order.number}`}
          subtitle={supplier?.name}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link to="/yarn/sample-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link></Button>
              <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
              <Button variant="outline" onClick={() => setRcpOpen(true)}><PackagePlus className="h-4 w-4 mr-1" /> Add Receipt</Button>
            </div>
          }
        />
      </div>

      <Card className="p-4 print:border-none print:shadow-none">
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-bold">Sample Yarn Order — {order.number}</h1>
        </div>
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground">Order Date</div><div className="font-medium">{order.orderDate}</div></div>
          <div><div className="text-muted-foreground">Expected Delivery</div><div className="font-medium">{sampleExpectedDelivery(order.orderDate)}</div></div>
          <div><div className="text-muted-foreground">Supplier</div><div className="font-medium">{supplier?.name ?? "—"}</div></div>
          <div><div className="text-muted-foreground">Linked PO</div><div className="font-medium">{po?.poNumber ?? "—"}</div></div>
          {order.remarks ? <div className="md:col-span-4"><div className="text-muted-foreground">Remarks</div><div>{order.remarks}</div></div> : null}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-2">Items</h3>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>Brand</TableHead><TableHead>Color</TableHead>
              <TableHead>Material</TableHead><TableHead>Qty (Kg)</TableHead><TableHead>Pantone</TableHead>
              <TableHead>Approval</TableHead><TableHead className="print:hidden">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {order.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{cName(it.clientId)}</TableCell>
                  <TableCell>{bName(it.brandId)}</TableCell>
                  <TableCell className="font-medium">{it.colorName}</TableCell>
                  <TableCell>{it.material}</TableCell>
                  <TableCell>{it.approxQty}</TableCell>
                  <TableCell>{it.pantone || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={it.approvalStatus === "approved" ? "default" : it.approvalStatus === "redye" ? "destructive" : "secondary"}>
                      {it.approvalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="print:hidden">
                    {it.approvalStatus === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setApproveFor(it.id); setShadeNo(""); }}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          yarnStore.redyeSampleItem(order.id, it.id); toast.success("Marked for re-dye");
                        }}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Redye
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {order.receipts.length > 0 && (
        <Card className="p-4">
          <h3 className="font-medium mb-2">Receipts</h3>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Shade #</TableHead><TableHead>Lot</TableHead>
                <TableHead>Gross (Kg)</TableHead><TableHead>Cones</TableHead><TableHead>Remarks</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {order.receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.receiptDate}</TableCell>
                    <TableCell className="font-mono text-xs">{r.supplierShadeNumber || "—"}</TableCell>
                    <TableCell>{r.lotNumber || "—"}</TableCell>
                    <TableCell>{r.grossWeight}</TableCell>
                    <TableCell>{r.cones}</TableCell>
                    <TableCell>{r.remarks || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

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

      <Dialog open={rcpOpen} onOpenChange={setRcpOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sample Receipt</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={rcp.receiptDate} onChange={(e) => setRcp({ ...rcp, receiptDate: e.target.value })} /></div>
            <div><Label>Supplier Shade #</Label><Input value={rcp.supplierShadeNumber} onChange={(e) => setRcp({ ...rcp, supplierShadeNumber: e.target.value })} /></div>
            <div><Label>Lot #</Label><Input value={rcp.lotNumber} onChange={(e) => setRcp({ ...rcp, lotNumber: e.target.value })} /></div>
            <div><Label>Gross Weight (Kg) *</Label><Input type="number" step="0.01" value={rcp.grossWeight} onChange={(e) => setRcp({ ...rcp, grossWeight: e.target.value })} /></div>
            <div><Label>Cones</Label><Input type="number" value={rcp.cones} onChange={(e) => setRcp({ ...rcp, cones: e.target.value })} /></div>
            <div className="col-span-2"><Label>Remarks</Label><Textarea rows={2} value={rcp.remarks} onChange={(e) => setRcp({ ...rcp, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRcpOpen(false)}>Cancel</Button>
            <Button onClick={saveReceipt}>Save Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
