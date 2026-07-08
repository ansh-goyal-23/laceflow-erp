import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft } from "lucide-react";
import { useYarnStore, inwardItemAllocatedQty, inwardItemUnallocatedQty } from "@/lib/yarn-store";

export const Route = createFileRoute("/_authenticated/yarn/inwards/$id")({
  component: InwardDetail,
});

function InwardDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const inward = useYarnStore((s) => s.inwards.find((r) => r.id === id));
  const suppliers = useYarnStore((s) => s.suppliers);
  if (!inward) {
    return <div className="p-6 text-sm text-muted-foreground">Not found. <button onClick={() => nav({ to: "/yarn/inwards" })} className="underline">Back</button></div>;
  }
  const supplier = suppliers.find((s) => s.id === inward.supplierId);
  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4">
      <PageHeader
        title={`Yarn Inward ${inward.number}`}
        subtitle={supplier?.name}
        actions={<Button variant="outline" asChild><Link to="/yarn/inwards"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link></Button>}
      />
      <Card className="p-4 grid md:grid-cols-4 gap-3 text-sm">
        <div><div className="text-muted-foreground">Inward Date</div><div className="font-medium">{inward.inwardDate}</div></div>
        <div><div className="text-muted-foreground">Supplier</div><div className="font-medium">{supplier?.name ?? "—"}</div></div>
        <div><div className="text-muted-foreground">Challan #</div><div className="font-medium">{inward.supplierChallanNumber || "—"}</div></div>
        <div><div className="text-muted-foreground">Items</div><div className="font-medium">{inward.items.length}</div></div>
        {inward.remarks && <div className="md:col-span-4"><div className="text-muted-foreground">Remarks</div>{inward.remarks}</div>}
      </Card>

      <Card className="p-4">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Shade #</TableHead><TableHead>Lot #</TableHead>
              <TableHead>Gross</TableHead><TableHead>Cones</TableHead><TableHead>Tube Wt</TableHead>
              <TableHead>Net</TableHead><TableHead>Allocated</TableHead><TableHead>Unallocated</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {inward.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.supplierShadeNumber}</TableCell>
                  <TableCell>{it.lotNumber || "—"}</TableCell>
                  <TableCell>{it.grossWeight.toFixed(2)}</TableCell>
                  <TableCell>{it.cones}</TableCell>
                  <TableCell>{it.paperTubeWeight.toFixed(3)}</TableCell>
                  <TableCell className="font-medium">{it.netWeight.toFixed(2)}</TableCell>
                  <TableCell>{inwardItemAllocatedQty(it).toFixed(2)}</TableCell>
                  <TableCell>{inwardItemUnallocatedQty(it).toFixed(2)}</TableCell>
                  <TableCell>{it.remarks || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}