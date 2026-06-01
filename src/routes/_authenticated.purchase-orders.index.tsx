import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, store, type PurchaseOrder } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchase-orders/")({
  component: POList,
});

const PAGE_SIZE = 10;

function POList() {
  const pos = useStore((s) => s.purchaseOrders);
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const navigate = useNavigate();

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<PurchaseOrder | null>(null);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    return pos
      .filter((p) => statusFilter === "all" || p.status === statusFilter)
      .filter((p) =>
        [p.poNumber, brandName(p.brandId), clientName(p.clientId)]
          .some((v) => v.toLowerCase().includes(t)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, q, statusFilter, brands, clients]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Purchase Orders"
        subtitle="All POs across brands and clients"
        actions={
          <Button onClick={() => navigate({ to: "/purchase-orders/new" })}>
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by PO #, brand or client…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>PO Date</TableHead>
                <TableHead>Delivery Date</TableHead>
                <TableHead>Status</TableHead>
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
                    <span className={`text-xs px-2 py-1 rounded-full ${p.status === "draft" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                      {p.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setViewing(p)} title="View"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" asChild title="Edit">
                      <Link to="/purchase-orders/$id/edit" params={{ id: p.id }}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirm(p)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
            <AlertDialogAction onClick={() => {
              if (confirm) { store.deletePO(confirm.id); toast.success("PO deleted"); }
              setConfirm(null);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl">
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Article</TableHead>
                      <TableHead>Lace</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>W×L</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewing.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>{i.articleCode || "—"}</TableCell>
                        <TableCell>{i.laceType || "—"}</TableCell>
                        <TableCell>{i.materialType || "—"}</TableCell>
                        <TableCell>{i.color || "—"}</TableCell>
                        <TableCell>{[i.width, i.length].filter(Boolean).join(" × ") || "—"}</TableCell>
                        <TableCell>{i.uom}</TableCell>
                        <TableCell className="text-right">{i.quantity}</TableCell>
                        <TableCell className="text-right">{i.rate}</TableCell>
                        <TableCell className="text-right font-medium">{(i.quantity * i.rate).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end text-sm">
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