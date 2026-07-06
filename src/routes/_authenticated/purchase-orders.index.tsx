import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, store, type PurchaseOrder } from "@/lib/store";
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
import { exportPOsToExcel } from "@/lib/excel-export";

export const Route = createFileRoute("/_authenticated/purchase-orders/")({
  component: POList,
});

const PAGE_SIZE = 10;

function cmpStr(a: string, b: string, dir: number) {
  return a.localeCompare(b) * dir;
}
function cmpNumStr(a: string, b: string, dir: number) {
  const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
  const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
  if (na !== nb) return (na - nb) * dir;
  return a.localeCompare(b) * dir;
}

type SortKey = "poNumber" | "brand" | "client" | "poDate" | "deliveryDate" | "status" | "createdAt";

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

function POList() {
  const pos = useStore((s) => s.purchaseOrders);
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const navigate = useNavigate();
  const { user } = useAuth();
  const canModify = (p: PurchaseOrder) => !!user && (user.role === "admin" || p.createdBy === user.id);

  const [q, setQ] = useState("");
  // Default: show active POs (Draft + Open); hide Completed unless user picks it.
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<PurchaseOrder | null>(null);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const [completeConfirm, setCompleteConfirm] = useState<PurchaseOrder | null>(null);

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return pos
      .filter((p) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return p.status === "draft" || p.status === "open";
        return p.status === statusFilter;
      })
      .filter((p) => brandFilter === "all" || p.brandId === brandFilter)
      .filter((p) => clientFilter === "all" || p.clientId === clientFilter)
      .filter((p) =>
        [p.poNumber, brandName(p.brandId), clientName(p.clientId)]
          .some((v) => v.toLowerCase().includes(t)),
      )
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortKey === "poNumber") return cmpNumStr(a.poNumber, b.poNumber, dir);
        if (sortKey === "brand") return cmpStr(brandName(a.brandId), brandName(b.brandId), dir);
        if (sortKey === "client") return cmpStr(clientName(a.clientId), clientName(b.clientId), dir);
        if (sortKey === "poDate") return cmpStr(a.poDate, b.poDate, dir);
        if (sortKey === "deliveryDate") return cmpStr(a.deliveryDate, b.deliveryDate, dir);
        if (sortKey === "status") return cmpStr(a.status, b.status, dir);
        return cmpStr(a.createdAt, b.createdAt, dir);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, q, statusFilter, brandFilter, clientFilter, sortKey, sortDir, brands, clients]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Purchase Orders"
        subtitle="All POs across brands and clients"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (filtered.length === 0) { toast.error("No POs to export"); return; }
                exportPOsToExcel(filtered.map((p) => p), brands, clients);
                toast.success(`Exported ${filtered.length} PO(s)`);
              }}
            >
              <Download className="h-4 w-4 mr-1" /> Export Excel
            </Button>
            <Button onClick={() => navigate({ to: "/purchase-orders/new" })}>
              <Plus className="h-4 w-4 mr-1" /> New PO
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row gap-3 mb-4 items-start xl:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by PO #, brand or client…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (Draft + Open)</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={brandFilter} onValueChange={(v) => { setBrandFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Brand" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clientFilter} onValueChange={(v) => { setClientFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(q || statusFilter !== "active" || brandFilter !== "all" || clientFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => {
                setQ(""); setStatusFilter("active"); setBrandFilter("all"); setClientFilter("all"); setSortKey("createdAt"); setSortDir("desc"); setPage(1);
              }}>
                <X className="h-4 w-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHeader label="PO Number" active={sortKey === "poNumber"} dir={sortDir} onClick={() => toggleSort("poNumber")} /></TableHead>
                <TableHead><SortHeader label="Brand" active={sortKey === "brand"} dir={sortDir} onClick={() => toggleSort("brand")} /></TableHead>
                <TableHead><SortHeader label="Client" active={sortKey === "client"} dir={sortDir} onClick={() => toggleSort("client")} /></TableHead>
                <TableHead><SortHeader label="PO Date" active={sortKey === "poDate"} dir={sortDir} onClick={() => toggleSort("poDate")} /></TableHead>
                <TableHead><SortHeader label="Delivery Date" active={sortKey === "deliveryDate"} dir={sortDir} onClick={() => toggleSort("deliveryDate")} /></TableHead>
                <TableHead><SortHeader label="Status" active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} /></TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No purchase orders found</TableCell></TableRow>
              ) : pageItems.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.poNumber}</TableCell>
                  <TableCell>{brandName(p.brandId)}</TableCell>
                  <TableCell>{clientName(p.clientId)}</TableCell>
                  <TableCell>{p.poDate}</TableCell>
                  <TableCell>{p.deliveryDate}</TableCell>
                  <TableCell>
                    <StatusBadge po={p} onClickOpen={() => setCompleteConfirm(p)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(p)} title="View"><Eye className="h-4 w-4" /></Button>
                    {canModify(p) && (
                      <>
                        <Button variant="ghost" size="icon" asChild title="Edit">
                          <Link to="/purchase-orders/$id/edit" params={{ id: p.id }}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirm(p)} title="Delete">
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
          <div className="text-muted-foreground">
            Showing {pageItems.length} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium">{confirm?.poNumber}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (confirm) {
                try {
                  await store.deletePO(confirm.id);
                  toast.success("PO deleted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to delete PO");
                }
              }
              setConfirm(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!completeConfirm} onOpenChange={(o) => !o && setCompleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this Purchase Order as Completed?</AlertDialogTitle>
            <AlertDialogDescription>
              After marking <span className="font-medium">{completeConfirm?.poNumber}</span> as Completed, it will no longer appear as an active working PO.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (completeConfirm) {
                try {
                  await store.updatePOStatus(completeConfirm.id, "completed");
                  toast.success(`${completeConfirm.poNumber} marked Completed`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to update status");
                }
              }
              setCompleteConfirm(null);
            }}>Yes, Mark Completed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.poNumber}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Field label="Brand" value={brandName(viewing.brandId)} />
                <Field label="Client" value={clientName(viewing.clientId)} />
                <Field label="PO Date" value={viewing.poDate} />
                <Field label="Delivery Date" value={viewing.deliveryDate} />
              </div>
              <div className="overflow-x-auto border rounded-md">
                <POItemsView items={viewing.items} />
              </div>
              <div className="flex justify-end text-sm gap-2">
                <div className="bg-muted px-4 py-2 rounded-md">
                  <span className="text-muted-foreground mr-2">Total Qty:</span>
                  <span className="font-semibold">
                    {viewing.items.reduce((s, i) => s + i.quantity, 0).toFixed(0)}
                  </span>
                </div>
                <div className="bg-muted px-4 py-2 rounded-md">
                  <span className="text-muted-foreground mr-2">Total:</span>
                  <span className="font-semibold">
                    {viewing.items.reduce((s, i) => s + i.quantity * i.rate, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function StatusBadge({ po, onClickOpen }: { po: PurchaseOrder; onClickOpen: () => void }) {
  const base = "inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full";
  if (po.status === "draft") {
    return <span className={`${base} bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200`}>Draft</span>;
  }
  if (po.status === "completed") {
    return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>Completed</span>;
  }
  return (
    <button
      type="button"
      onClick={onClickOpen}
      title="Click to mark Completed"
      className={`${base} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors cursor-pointer`}
    >
      Open
    </button>
  );
}