import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye, Trash2 } from "lucide-react";
import { useYarnStore, yarnStore } from "@/lib/yarn-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/yarn/inwards/")({
  component: InwardsList,
});

function InwardsList() {
  const inwards = useYarnStore((s) => s.inwards);
  const suppliers = useYarnStore((s) => s.suppliers);
  const [q, setQ] = useState("");
  const sName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return inwards;
    return inwards.filter((r) =>
      r.number.toLowerCase().includes(query) ||
      sName(r.supplierId).toLowerCase().includes(query) ||
      (r.supplierChallanNumber || "").toLowerCase().includes(query),
    );
  }, [inwards, q, suppliers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Yarn Inward"
        subtitle="Physical yarn received from suppliers (Store dept)"
        actions={<Button asChild><Link to="/yarn/inwards/new"><Plus className="h-4 w-4 mr-1" /> New Inward</Link></Button>}
      />
      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search inward #, supplier, challan #…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Inward #</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead>
              <TableHead>Challan #</TableHead><TableHead>Items</TableHead>
              <TableHead>Total Net (Kg)</TableHead><TableHead className="w-[80px]"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No inwards yet.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const totalNet = r.items.reduce((s, i) => s + i.netWeight, 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.number}</TableCell>
                    <TableCell>{r.inwardDate}</TableCell>
                    <TableCell>{sName(r.supplierId)}</TableCell>
                    <TableCell>{r.supplierChallanNumber || "—"}</TableCell>
                    <TableCell>{r.items.length}</TableCell>
                    <TableCell>{totalNet.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild><Link to="/yarn/inwards/$id" params={{ id: r.id }}><Eye className="h-4 w-4" /></Link></Button>
                        <Button variant="ghost" size="icon" onClick={async () => {
                          if (!confirm("Delete this inward? Any allocations will be reversed.")) return;
                          try { await yarnStore.deleteInward(r.id); toast.success("Deleted"); }
                          catch (e) { toast.error((e as Error).message); }
                        }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
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