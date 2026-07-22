import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, PackageCheck, CheckCircle2, Send, RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { useYarnStore } from "@/lib/yarn-store";
import {
  useProductionStore, productionStore,
  poProgress, poItemShades, poRawMaterialSummary, daysRemaining,
  PROD_STATUS_BADGE,
} from "@/lib/production-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/production/$id")({
  component: ProductionDetail,
});

function ProductionDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const po = useStore((s) => s.purchaseOrders.find((p) => p.id === id));
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const yarnState = useYarnStore((s) => s);
  const { records, items } = useProductionStore((s) => s);
  const [confirmPack, setConfirmPack] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);

  if (!po) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        PO not found.{" "}
        <button onClick={() => nav({ to: "/production" })} className="underline">
          Back to Production
        </button>
      </div>
    );
  }

  const rec = records[po.id];
  const progress = poProgress(po, yarnState, items);
  const rawMats = useMemo(() => poRawMaterialSummary(po, yarnState), [po, yarnState]);
  const brandName = brands.find((b) => b.id === po.brandId)?.name ?? "—";
  const clientName = clients.find((c) => c.id === po.clientId)?.name ?? "—";
  const dr = daysRemaining(po.deliveryDate);

  const inProduction = rec?.status === "in_production";
  const packedReady = rec?.status === "packed_ready";
  const canPack = inProduction && progress.total > 0 && progress.completed === progress.total;

  const toggleItem = async (poItemId: string, next: boolean) => {
    if (!inProduction) {
      toast.error("Send this PO to production first");
      return;
    }
    try {
      await productionStore.markItemStatus(poItemId, po.id, next ? "completed" : "waiting");
    } catch (e) { toast.error((e as Error).message); }
  };

  const doSend = async () => {
    try {
      await productionStore.sendToProduction(po.id);
      toast.success("Sent to production");
    } catch (e) { toast.error((e as Error).message); }
  };
  const doPack = async () => {
    try {
      await productionStore.markPacked(po.id);
      toast.success("Marked packed & ready for dispatch");
      setConfirmPack(false);
    } catch (e) { toast.error((e as Error).message); }
  };
  const doRevert = async () => {
    try {
      await productionStore.revertToProduction(po.id);
      toast.success("Moved back to In Production");
      setConfirmRevert(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-4">
      <PageHeader
        title={`Production — ${po.poNumber}`}
        subtitle={`${clientName} · ${brandName} · Delivery ${po.deliveryDate}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/production"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
            </Button>
            {!rec && (
              <Button onClick={doSend}>
                <Send className="h-4 w-4 mr-1" /> Send To Production
              </Button>
            )}
            {inProduction && (
              <Button disabled={!canPack} onClick={() => setConfirmPack(true)}>
                <PackageCheck className="h-4 w-4 mr-1" /> Mark Packed & Ready For Dispatch
              </Button>
            )}
            {packedReady && (
              <Button variant="outline" onClick={() => setConfirmRevert(true)}>
                <RotateCcw className="h-4 w-4 mr-1" /> Move Back To Production
              </Button>
            )}
          </div>
        }
      />

      <Card className="p-4 grid md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Status</div>
          <Badge className={`mt-1 ${rec ? PROD_STATUS_BADGE[rec.status] : "bg-muted text-muted-foreground"}`}>
            {rec ? (rec.status === "in_production" ? "In Production"
              : rec.status === "packed_ready" ? "Packed & Ready" : "Waiting")
              : "Waiting For Production"}
          </Badge>
        </div>
        <div>
          <div className="text-muted-foreground">Days Remaining</div>
          <div className="font-medium tabular-nums">{dr < 0 ? `${Math.abs(dr)} overdue` : `${dr} days`}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Progress</div>
          <div className="font-medium tabular-nums">
            {progress.completed} / {progress.total} items ({progress.percent}%)
          </div>
          <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Released</div>
          <div className="font-medium">
            {rec?.sentToProductionAt ? new Date(rec.sentToProductionAt).toLocaleString() : "—"}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Raw Material Summary</div>
        {rawMats.length === 0 ? (
          <div className="text-sm text-muted-foreground">No raw materials required.</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Shade #</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rawMats.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell>{m.material}</TableCell>
                    <TableCell>{m.colorName}</TableCell>
                    <TableCell className="font-mono text-xs">{m.supplierShadeNumber || "—"}</TableCell>
                    <TableCell>
                      {m.received
                        ? <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Received ✓</Badge>
                        : <Badge variant="secondary">Pending</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Production Items</div>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Article</TableHead>
              <TableHead>Lace Type</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Width</TableHead>
              <TableHead>Length</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Base Shade #</TableHead>
              <TableHead>Line Shade #</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {po.items.map((it) => {
                const override = yarnState.overrides[it.id] === "yarn_not_required";
                const shades = poItemShades(po, it, yarnState);
                const base = shades.find((s) => s.kind === "base" || s.kind === "single")?.supplierShadeNumber;
                const line = shades.find((s) => s.kind === "line")?.supplierShadeNumber;
                const rec = items[it.id];
                const done = rec?.status === "completed";
                return (
                  <TableRow key={it.id} className={done ? "bg-emerald-500/5" : ""}>
                    <TableCell>
                      {override ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Checkbox
                          checked={done}
                          disabled={!inProduction}
                          onCheckedChange={(v) => toggleItem(it.id, !!v)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{it.articleCode}</TableCell>
                    <TableCell>{it.laceType}</TableCell>
                    <TableCell>{it.materialType}</TableCell>
                    <TableCell>{it.width}</TableCell>
                    <TableCell>{it.length}</TableCell>
                    <TableCell>{it.color}</TableCell>
                    <TableCell>{it.uom}</TableCell>
                    <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                    <TableCell className="font-mono text-xs">{base || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{line || "—"}</TableCell>
                    <TableCell>
                      {override ? (
                        <Badge variant="secondary">Yarn Not Required</Badge>
                      ) : done ? (
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Waiting</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlertDialog open={confirmPack} onOpenChange={setConfirmPack}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {po.poNumber} packed & ready?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the PO to the "Packed & Ready For Dispatch" tab so Dispatch can begin invoicing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doPack}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevert} onOpenChange={setConfirmRevert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {po.poNumber} back to production?</AlertDialogTitle>
            <AlertDialogDescription>
              Use this if additional production work is needed before dispatch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRevert}>Move Back</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}