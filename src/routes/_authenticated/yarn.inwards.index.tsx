import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore, inwardItemContext, inwardItemUnallocatedQty } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/inwards/")({
  component: InwardsList,
});

function InwardsList() {
  const inwards = useYarnStore((s) => s.inwards);
  const suppliers = useYarnStore((s) => s.suppliers);
  const store = useYarnStore((s) => s);
  const [q, setQ] = useState("");
  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  // Flatten to one row per inward item so we can show Color / Type / Linked Order.
  const rows = useMemo(() => {
    const out: Array<{
      key: string;
      inwardId: string;
      inwardNumber: string;
      inwardDate: string;
      supplierId: string;
      supplierName: string;
      shade: string;
      lot: string;
      gross: number;
      net: number;
      type: "production" | "sample" | "unknown";
      colorName: string;
      linkedOrderNumber: string;
      linkedOrderKind?: "production" | "sample";
      linkedOrderId?: string;
      status: string;
    }> = [];
    for (const inw of inwards) {
      for (const it of inw.items) {
        const ctx = inwardItemContext(store, inw, it);
        const unallocated = inwardItemUnallocatedQty(it);
        const status =
          ctx.type === "sample" ? "Sample Received"
          : ctx.type === "production"
            ? (unallocated > 0.0001 ? "Pending Allocation" : "Allocated")
            : "Unlinked";
        out.push({
          key: it.id,
          inwardId: inw.id, inwardNumber: inw.number,
          inwardDate: inw.inwardDate,
          supplierId: inw.supplierId,
          supplierName: sName(inw.supplierId),
          shade: it.supplierShadeNumber,
          lot: it.lotNumber || "—",
          gross: it.grossWeight, net: it.netWeight,
          type: ctx.type,
          colorName: ctx.colorName || "—",
          linkedOrderNumber: ctx.linkedOrderNumber || "—",
          linkedOrderKind: ctx.linkedOrderKind,
          linkedOrderId: ctx.linkedOrderId,
          status,
        });
      }
    }
    const query = q.trim().toLowerCase();
    if (!query) return out;
    return out.filter((r) =>
      r.inwardNumber.toLowerCase().includes(query) ||
      r.supplierName.toLowerCase().includes(query) ||
      r.shade.toLowerCase().includes(query) ||
      r.colorName.toLowerCase().includes(query) ||
      r.linkedOrderNumber.toLowerCase().includes(query),
    );
  }, [inwards, store, q, suppliers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Yarn Inward"
        subtitle="Single register of every physical yarn received — Production and Sample"
        actions={<Button asChild><Link to="/yarn/inwards/new"><Plus className="h-4 w-4 mr-1" /> New Inward</Link></Button>}
      />
      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search inward #, supplier, shade, color, linked order…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Inward #</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Type</TableHead><TableHead>Color</TableHead>
              <TableHead>Shade #</TableHead><TableHead>Lot</TableHead>
              <TableHead>Gross (Kg)</TableHead><TableHead>Net (Kg)</TableHead>
              <TableHead>Linked Order</TableHead><TableHead>Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No inwards yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-mono"><Link to="/yarn/inwards/$id" params={{ id: r.inwardId }} className="hover:underline">{r.inwardNumber}</Link></TableCell>
                  <TableCell>{r.inwardDate}</TableCell>
                  <TableCell>{r.supplierName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={
                      r.type === "sample" ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                      : r.type === "production" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : ""
                    }>
                      {r.type === "sample" ? "Sample" : r.type === "production" ? "Production" : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{r.colorName}</TableCell>
                  <TableCell className="font-mono text-xs">{r.shade}</TableCell>
                  <TableCell>{r.lot}</TableCell>
                  <TableCell>{r.gross.toFixed(2)}</TableCell>
                  <TableCell>{r.net.toFixed(2)}</TableCell>
                  <TableCell>
                    {r.linkedOrderKind === "production" && r.linkedOrderId ? (
                      <Link to="/yarn/production-orders/$id" params={{ id: r.linkedOrderId }} className="font-mono text-xs hover:underline">{r.linkedOrderNumber}</Link>
                    ) : r.linkedOrderKind === "sample" && r.linkedOrderId ? (
                      <Link to="/yarn/sample-orders/$id" params={{ id: r.linkedOrderId }} className="font-mono text-xs hover:underline">{r.linkedOrderNumber}</Link>
                    ) : (
                      <span className="text-muted-foreground">{r.linkedOrderNumber}</span>
                    )}
                  </TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" asChild><Link to="/yarn/inwards/$id" params={{ id: r.inwardId }}><Eye className="h-4 w-4" /></Link></Button>
                      <Button variant="ghost" size="icon" onClick={async () => {
                        if (!confirm("Delete this inward? Any allocations will be reversed and any linked sample receipts will remain (delete from the sample order if needed).")) return;
                        try { await yarnStore.deleteInward(r.inwardId); toast.success("Deleted"); }
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
    </div>
  );
}