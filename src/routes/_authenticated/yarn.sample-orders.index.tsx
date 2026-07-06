import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye } from "lucide-react";
import { useYarnStore, sampleExpectedDelivery } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/yarn/sample-orders/")({
  component: SampleOrdersList,
});

function SampleOrdersList() {
  const orders = useYarnStore((s) => s.sampleOrders);
  const suppliers = useYarnStore((s) => s.suppliers);
  const pos = useStore((s) => s.purchaseOrders);
  const [q, setQ] = useState("");

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
                <TableHead className="w-[80px]"></TableHead>
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
                      <Button variant="ghost" size="icon" asChild><Link to="/yarn/sample-orders/$id" params={{ id: o.id }}><Eye className="h-4 w-4" /></Link></Button>
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
