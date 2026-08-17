import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, store, type SalesReturn } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Eye, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { exportXLSX } from "@/lib/export-table";

export const Route = createFileRoute("/_authenticated/sales-returns/")({
  component: SalesReturnList,
});

const DOC_LABEL: Record<string, string> = { debit_note: "Debit Note", return_challan: "Return Challan" };

function SalesReturnList() {
  const returns = useStore((s) => s.salesReturns);
  const clients = useStore((s) => s.clients);
  const navigate = useNavigate();
  const { user } = useAuth();
  const canModify = (r: SalesReturn) => !!user && (user.role === "admin" || r.createdBy === user.id);

  const [q, setQ] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [confirm, setConfirm] = useState<SalesReturn | null>(null);
  const [viewing, setViewing] = useState<SalesReturn | null>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const current = viewing ? returns.find((r) => r.id === viewing.id) ?? viewing : null;

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return returns
      .filter((r) => clientFilter === "all" || r.clientId === clientFilter)
      .filter((r) => !t || [r.returnNumber, r.referenceNumber, clientName(r.clientId), ...r.items.map((i) => i.poNumber)]
        .some((v) => (v ?? "").toLowerCase().includes(t)))
      .sort((a, b) => b.returnDate.localeCompare(a.returnDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returns, q, clientFilter, clients]);

  async function doDelete() {
    if (!confirm) return;
    try {
      await store.deleteSalesReturn(confirm.id);
      toast.success("Sales return deleted");
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to delete");
    } finally {
      setConfirm(null);
    }
  }

  async function toggleSettled(r: SalesReturn, itemId: string, settled: boolean) {
    try {
      await store.setReturnItemSettled(r.id, itemId, settled);
      toast.success(settled ? "Marked settled" : "Re-opened as pendency");
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to update");
    }
  }

  const exportAll = () => {
    if (!rows.length) return toast.error("Nothing to export");
    const headers = ["Return No", "Date", "Client", "Type", "Client Doc No", "PO", "Invoice", "Article", "Color", "UOM", "Return Qty", "Rate", "Reason", "Settled"];
    const data = rows.flatMap((r) => r.items.map((i) => [
      r.returnNumber, r.returnDate, clientName(r.clientId), DOC_LABEL[r.docType], r.referenceNumber,
      i.poNumber, i.invoiceNumber, i.articleCode, i.color, i.uom, i.returnQty, i.rate, i.reason, i.settled ? "Yes" : "No",
    ]));
    exportXLSX("sales-returns.xlsx", "Sales Returns", headers, data);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Sales Returns"
        subtitle="Client returns via debit note or return challan — pendency re-opens automatically"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportAll}><Download className="h-4 w-4 mr-1" /> Excel</Button>
            <Button asChild><Link to="/sales-returns/new"><Plus className="h-4 w-4 mr-1" /> Create Sales Return</Link></Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 mb-4 md:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search return / PO / client…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client Doc No</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Return Qty</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No sales returns yet</TableCell></TableRow>
              ) : rows.map((r) => {
                const qty = r.items.reduce((s, i) => s + (Number(i.returnQty) || 0), 0);
                const amt = r.items.reduce((s, i) => s + (Number(i.returnQty) || 0) * (Number(i.rate) || 0), 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <button className="text-primary hover:underline" onClick={() => setViewing(r)}>{r.returnNumber}</button>
                    </TableCell>
                    <TableCell>{r.returnDate}</TableCell>
                    <TableCell>{clientName(r.clientId)}</TableCell>
                    <TableCell><Badge variant="secondary">{DOC_LABEL[r.docType]}</Badge></TableCell>
                    <TableCell>{r.referenceNumber || "—"}</TableCell>
                    <TableCell className="text-right">{r.items.length}</TableCell>
                    <TableCell className="text-right">{qty}</TableCell>
                    <TableCell className="text-right">{amt.toFixed(2)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                      {canModify(r) && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/sales-returns/$id/edit", params: { id: r.id } })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setConfirm(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!current} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{current?.returnNumber} — Returned Items</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-3">
              {current.remarks && <div className="text-sm text-muted-foreground">{current.remarks}</div>}
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Article</TableHead>
                      <TableHead>W×L</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Return Qty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Pendency Effect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {current.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.poNumber || "—"}</TableCell>
                        <TableCell>{i.invoiceNumber || "—"}</TableCell>
                        <TableCell>{i.articleCode || "—"}</TableCell>
                        <TableCell>{[i.width, i.length].filter(Boolean).join(" × ") || "—"}</TableCell>
                        <TableCell>{i.color || "—"}</TableCell>
                        <TableCell>{i.uom}</TableCell>
                        <TableCell className="text-right font-medium">{i.returnQty}</TableCell>
                        <TableCell>{i.reason || "—"}</TableCell>
                        <TableCell>
                          {i.poId ? (
                            <span className="text-xs text-muted-foreground">Re-opened on PO {i.poNumber}</span>
                          ) : i.settled ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Settled</Badge>
                              {canModify(current) && (
                                <Button variant="ghost" size="sm" onClick={() => toggleSettled(current, i.id, false)}>
                                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Undo
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300" variant="secondary">Client pendency</Badge>
                              {canModify(current) && (
                                <Button variant="outline" size="sm" onClick={() => toggleSettled(current, i.id, true)}>
                                  Mark settled
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sales return?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.returnNumber} will be removed and the affected PO pendency will be recalculated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
