import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Search, Factory, PackageCheck, ClipboardList, Send } from "lucide-react";
import { useStore, type PurchaseOrder } from "@/lib/store";
import { useYarnStore } from "@/lib/yarn-store";
import {
  useProductionStore, productionStore,
  poProductionTab, poProgress, daysRemaining,
  type ProductionTab,
} from "@/lib/production-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/")({
  component: ProductionIndex,
});

function ProductionIndex() {
  const pos = useStore((s) => s.purchaseOrders);
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const yarnState = useYarnStore((s) => s);
  const { records, items } = useProductionStore((s) => s);
  const [tab, setTab] = useState<ProductionTab>("waiting");
  const [q, setQ] = useState("");
  const [releasing, setReleasing] = useState<PurchaseOrder | null>(null);

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const bucketed = useMemo(() => {
    const w: PurchaseOrder[] = [];
    const i: PurchaseOrder[] = [];
    const p: PurchaseOrder[] = [];
    for (const po of pos) {
      if (po.status !== "open") continue;
      const t = poProductionTab(po, yarnState, records);
      if (t === "waiting") w.push(po);
      else if (t === "in_production") i.push(po);
      else if (t === "packed_ready") p.push(po);
    }
    const sortByDue = (a: PurchaseOrder, b: PurchaseOrder) =>
      a.deliveryDate.localeCompare(b.deliveryDate);
    return { waiting: w.sort(sortByDue), in_production: i.sort(sortByDue), packed_ready: p.sort(sortByDue) };
  }, [pos, yarnState, records]);

  const list = bucketed[tab];
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((po) =>
      po.poNumber.toLowerCase().includes(query) ||
      clientName(po.clientId).toLowerCase().includes(query) ||
      brandName(po.brandId).toLowerCase().includes(query),
    );
  }, [list, q, clients, brands]);

  const confirmRelease = async () => {
    if (!releasing) return;
    try {
      await productionStore.sendToProduction(releasing.id);
      toast.success(`${releasing.poNumber} sent to production`);
      setReleasing(null);
      setTab("in_production");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-4">
      <PageHeader
        title="Production Management"
        subtitle="Release procured POs, track production progress, pack for dispatch"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          label="Waiting for Production" count={bucketed.waiting.length}
          icon={ClipboardList} active={tab === "waiting"}
          onClick={() => setTab("waiting")}
          tone="bg-amber-500/10 text-amber-700 dark:text-amber-300"
        />
        <SummaryCard
          label="In Production" count={bucketed.in_production.length}
          icon={Factory} active={tab === "in_production"}
          onClick={() => setTab("in_production")}
          tone="bg-blue-500/10 text-blue-700 dark:text-blue-300"
        />
        <SummaryCard
          label="Packed & Ready for Dispatch" count={bucketed.packed_ready.length}
          icon={PackageCheck} active={tab === "packed_ready"}
          onClick={() => setTab("packed_ready")}
          tone="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        />
      </div>

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search PO#, client, brand…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>PO Number</TableHead>
                {tab === "packed_ready" && <TableHead>Packed Date</TableHead>}
                <TableHead>Delivery Date</TableHead>
                <TableHead>Days Rem.</TableHead>
                {tab === "waiting" && <TableHead>Items</TableHead>}
                {tab === "in_production" && <TableHead>Progress</TableHead>}
                <TableHead className="w-[220px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    Nothing here yet.
                  </TableCell>
                </TableRow>
              ) : filtered.map((po) => {
                const dr = daysRemaining(po.deliveryDate);
                const rec = records[po.id];
                const prog = poProgress(po, yarnState, items);
                return (
                  <TableRow key={po.id}>
                    <TableCell>{clientName(po.clientId)}</TableCell>
                    <TableCell>{brandName(po.brandId)}</TableCell>
                    <TableCell className="font-mono">{po.poNumber}</TableCell>
                    {tab === "packed_ready" && (
                      <TableCell>{rec?.packedAt ? new Date(rec.packedAt).toLocaleDateString() : "—"}</TableCell>
                    )}
                    <TableCell>{po.deliveryDate}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={dr < 0 ? "bg-red-500/10 text-red-700 dark:text-red-300" : dr <= 3 ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : ""}>
                        {dr < 0 ? `${Math.abs(dr)} overdue` : `${dr} d`}
                      </Badge>
                    </TableCell>
                    {tab === "waiting" && <TableCell>{po.items.length}</TableCell>}
                    {tab === "in_production" && (
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${prog.percent}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {prog.completed}/{prog.total}
                          </span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {tab === "waiting" && (
                          <Button size="sm" onClick={() => setReleasing(po)}>
                            <Send className="h-3.5 w-3.5 mr-1" /> Send To Production
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/production/$id" params={{ id: po.id }}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> Open
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={!!releasing} onOpenChange={(o) => !o && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {releasing?.poNumber} to production?</AlertDialogTitle>
            <AlertDialogDescription>
              Procurement has verified that all required yarn is received and shades are finalised.
              The PO will move into the In Production tab and become visible to the production floor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRelease}>Send To Production</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryCard({
  label, count, icon: Icon, active, onClick, tone,
}: {
  label: string; count: number; icon: typeof Factory;
  active: boolean; onClick: () => void; tone: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-4 transition-all hover:shadow-sm ${
        active ? "border-primary ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{count}</div>
        </div>
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </button>
  );
}