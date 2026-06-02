import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, store, type Invoice } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Eye, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/invoices/")({
  component: InvoiceList,
});

const PAGE_SIZE = 10;

function InvoiceList() {
  const invoices = useStore((s) => s.invoices);
  const clients = useStore((s) => s.clients);
  const navigate = useNavigate();
  const { user } = useAuth();
  const canModify = (i: Invoice) => !!user && (user.role === "admin" || i.createdBy === user.id);

  const [q, setQ] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"invoiceNumber" | "dispatchDate" | "createdAt">("dispatchDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const enriched = useMemo(() =>
    invoices.map((i) => {
      const qty = i.items.reduce((s, x) => s + (Number(x.dispatchQty) || 0), 0);
      const amt = i.items.reduce((s, x) => s + (Number(x.dispatchQty) || 0) * (Number(x.rate) || 0), 0);
      return { inv: i, qty, amt };
    }), [invoices]);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return enriched
      .filter(({ inv }) => clientFilter === "all" || inv.clientId === clientFilter)
      .filter(({ inv }) =>
        [inv.invoiceNumber, clientName(inv.clientId)].some((v) => v.toLowerCase().includes(t)),
      )
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "invoiceNumber") return a.inv.invoiceNumber.localeCompare(b.inv.invoiceNumber) * dir;
        if (sortKey === "dispatchDate") return a.inv.dispatchDate.localeCompare(b.inv.dispatchDate) * dir;
        return a.inv.createdAt.localeCompare(b.inv.createdAt) * dir;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, q, clientFilter, sortKey, sortDir, clients]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Invoices"
        subtitle="Dispatch invoices across clients"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/invoices/import">Import Excel</Link>
            </Button>
            <Button onClick={() => navigate({ to: "/invoices/new" })}>
              <Plus className="h-4 w-4 mr-1" /> New Invoice
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row gap-3 mb-4 items-start xl:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by invoice # or client…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dispatchDate">Dispatch Date</SelectItem>
                <SelectItem value="invoiceNumber">Invoice #</SelectItem>
                <SelectItem value="createdAt">Created</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>
              {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
            {(q || clientFilter !== "all" || sortKey !== "dispatchDate" || sortDir !== "desc") && (
              <Button variant="ghost" size="sm" onClick={() => { setQ(""); setClientFilter("all"); setSortKey("dispatchDate"); setSortDir("desc"); setPage(1); }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Dispatch Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No invoices yet</TableCell></TableRow>
              ) : pageItems.map(({ inv, qty, amt }) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                  <TableCell>{inv.dispatchDate}</TableCell>
                  <TableCell>{clientName(inv.clientId)}</TableCell>
                  <TableCell className="text-right">{qty}</TableCell>
                  <TableCell className="text-right">{amt.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(inv)} title="View"><Eye className="h-4 w-4" /></Button>
                    {canModify(inv) && (
                      <>
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link to="/invoices/$id/edit" params={{ id: inv.id }}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirm(inv)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-muted-foreground">Showing {pageItems.length} of {filtered.length}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span>Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice <span className="font-medium">{confirm?.invoiceNumber}</span> and restore PO balances.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (confirm) { await store.deleteInvoice(confirm.id); toast.success("Invoice deleted"); }
              setConfirm(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{viewing?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Client</div><div className="font-medium">{clientName(viewing.clientId)}</div></div>
                <div><div className="text-xs text-muted-foreground">Dispatch Date</div><div className="font-medium">{viewing.dispatchDate}</div></div>
                <div><div className="text-xs text-muted-foreground">Items</div><div className="font-medium">{viewing.items.length}</div></div>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Article</TableHead>
                      <TableHead>Lace</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>W×L</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewing.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.poNumber || "—"}</TableCell>
                        <TableCell>{i.articleCode || "—"}</TableCell>
                        <TableCell>{i.laceType || "—"}</TableCell>
                        <TableCell>{i.materialType || "—"}</TableCell>
                        <TableCell>{[i.width, i.length].filter(Boolean).join(" × ") || "—"}</TableCell>
                        <TableCell>{i.color || "—"}</TableCell>
                        <TableCell>{i.uom}</TableCell>
                        <TableCell className="text-right">{i.dispatchQty}</TableCell>
                        <TableCell className="text-right">{i.rate}</TableCell>
                        <TableCell className="text-right font-medium">{(i.dispatchQty * i.rate).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}