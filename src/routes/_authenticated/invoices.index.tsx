import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, store, type Invoice } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Eye, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X, Download } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { exportInvoicesToExcel } from "@/lib/excel-export";

export const Route = createFileRoute("/_authenticated/invoices/")({
  component: InvoiceList,
});

const PAGE_SIZE = 10;

function cmpNum(a: number, b: number, dir: number) {
  return (a - b) * dir;
}
function cmpStr(a: string, b: string, dir: number) {
  return a.localeCompare(b) * dir;
}
function cmpInvoiceNum(a: string, b: string, dir: number) {
  const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
  const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
  if (na !== nb) return (na - nb) * dir;
  return a.localeCompare(b) * dir;
}

type SortKey = "invoiceNumber" | "dispatchDate" | "client" | "totalQty" | "totalAmount" | "createdAt";

function SortHeader({ label, active, dir, onClick, align = "left" }: {
  label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void; align?: "left" | "right";
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}
      <Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );
}

function InvoiceList() {
  const invoices = useStore((s) => s.invoices);
  const clients = useStore((s) => s.clients);
  const navigate = useNavigate();
  const { user } = useAuth();
  const canModify = (i: Invoice) => !!user && (user.role === "admin" || i.createdBy === user.id);

  const [q, setQ] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("dispatchDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const enriched = useMemo(() =>
    invoices.map((i) => {
      const qty = i.items.reduce((s, x) => s + (Number(x.dispatchQty) || 0), 0);
      const amt = i.items.reduce((s, x) => s + (Number(x.dispatchQty) || 0) * (Number(x.rate) || 0), 0);
      return { inv: i, qty, amt, clientName: clientName(i.clientId) };
    }), [invoices, clients]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return enriched
      .filter(({ inv }) => clientFilter === "all" || inv.clientId === clientFilter)
      .filter(({ inv, clientName: cn }) => {
        const poNumbers = inv.items.map((i) => i.poNumber).filter(Boolean);
        return [inv.invoiceNumber, cn, ...poNumbers].some((v) => v.toLowerCase().includes(t));
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "invoiceNumber") return cmpInvoiceNum(a.inv.invoiceNumber, b.inv.invoiceNumber, dir);
        if (sortKey === "dispatchDate") return cmpStr(a.inv.dispatchDate, b.inv.dispatchDate, dir);
        if (sortKey === "client") return cmpStr(a.clientName, b.clientName, dir);
        if (sortKey === "totalQty") return cmpNum(a.qty, b.qty, dir);
        if (sortKey === "totalAmount") return cmpNum(a.amt, b.amt, dir);
        return cmpStr(a.inv.createdAt, b.inv.createdAt, dir);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched, q, clientFilter, sortKey, sortDir]);

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
            <Button
              variant="outline"
              onClick={() => {
                if (filtered.length === 0) { toast.error("No invoices to export"); return; }
                exportInvoicesToExcel(filtered.map((f) => f.inv), clients);
                toast.success(`Exported ${filtered.length} invoice(s)`);
              }}
            >
              <Download className="h-4 w-4 mr-1" /> Export Excel
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
            <Input className="pl-9" placeholder="Search by invoice #, client, or PO #…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {(q || clientFilter !== "all") && (
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
                <TableHead><SortHeader label="Invoice #" active={sortKey === "invoiceNumber"} dir={sortDir} onClick={() => toggleSort("invoiceNumber")} /></TableHead>
                <TableHead><SortHeader label="Dispatch Date" active={sortKey === "dispatchDate"} dir={sortDir} onClick={() => toggleSort("dispatchDate")} /></TableHead>
                <TableHead><SortHeader label="Client" active={sortKey === "client"} dir={sortDir} onClick={() => toggleSort("client")} /></TableHead>
                <TableHead className="text-right"><SortHeader label="Total Qty" align="right" active={sortKey === "totalQty"} dir={sortDir} onClick={() => toggleSort("totalQty")} /></TableHead>
                <TableHead className="text-right"><SortHeader label="Total Amount" align="right" active={sortKey === "totalAmount"} dir={sortDir} onClick={() => toggleSort("totalAmount")} /></TableHead>
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