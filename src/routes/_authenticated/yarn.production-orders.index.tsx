import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye } from "lucide-react";
import { useYarnStore } from "@/lib/yarn-store";

export const Route = createFileRoute("/_authenticated/yarn/production-orders/")({
  component: ProdOrdersList,
});

function ProdOrdersList() {
  const orders = useYarnStore((s) => s.productionOrders);
  const suppliers = useYarnStore((s) => s.suppliers);
  const [q, setQ] = useState("");

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
              <TableHead>Status</TableHead><TableHead className="w-[80px]"></TableHead>
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
                      <Button variant="ghost" size="icon" asChild><Link to="/yarn/production-orders/$id" params={{ id: o.id }}><Eye className="h-4 w-4" /></Link></Button>
                    </TableCell>
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
