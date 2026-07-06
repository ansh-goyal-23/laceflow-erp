import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft } from "lucide-react";
import { useYarnStore } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";

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
  if (!order) return <div className="p-6 text-sm text-muted-foreground">Not found. <button onClick={() => nav({ to: "/yarn/production-orders" })} className="underline">Back</button></div>;

  const supplier = suppliers.find((s) => s.id === order.supplierId);
  const cName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const poNum = (id: string) => pos.find((p) => p.id === id)?.poNumber ?? "—";
  const shade = (id?: string | null) => shades.find((s) => s.id === id);

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4">
      <PageHeader
        title={`Production Order ${order.number}`}
        subtitle={supplier?.name}
        actions={<Button variant="outline" asChild><Link to="/yarn/production-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link></Button>}
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
    </div>
  );
}
