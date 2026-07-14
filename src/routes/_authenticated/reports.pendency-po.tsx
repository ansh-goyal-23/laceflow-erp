import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, type PurchaseOrder } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X, Download, FileSpreadsheet, Printer } from "lucide-react";
import {
  computePOPendencies, daysRemainingLabel, urgencyClass,
  poItemBreakdown, type POPendency,
} from "@/lib/reports";
import { useYarnStore, poOverallStage, poItemStage, STAGE_LABEL, STAGE_BADGE } from "@/lib/yarn-store";
import { Badge } from "@/components/ui/badge";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports/pendency-po")({
  component: PendencyPOReport,
});

const PAGE_SIZE = 25;

type SortKey = "brand" | "client" | "poNumber" | "poDate" | "deliveryDate" | "daysLeft" | "ordered" | "dispatched" | "pending" | "stage";

function SortH({ label, k, sortKey, dir, onClick }: { label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = sortKey === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button onClick={() => onClick(k)} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground whitespace-nowrap">
      {label}<Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );
}

function PendencyPOReport() {
  const pos = useStore((s) => s.purchaseOrders);
  const invoices = useStore((s) => s.invoices);
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const yarn = useYarnStore((s) => s);
  const stageFor = (po: PurchaseOrder) => poOverallStage(yarn, po);

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";

  const [q, setQ] = useState("");
  const [brandF, setBrandF] = useState("all");
  const [clientF, setClientF] = useState("all");
  const [poF, setPoF] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [daysF, setDaysF] = useState("all"); // all | overdue | dueSoon | normal
  const [minPending, setMinPending] = useState("");
  const [maxPending, setMaxPending] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("daysLeft");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);

  const toggle = (k: SortKey) => { if (sortKey === k) setDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setDir("asc"); } setPage(1); };

  const rows = useMemo(() => {
    const base = computePOPendencies(pos, invoices);
    const t = q.toLowerCase();
    const poT = poF.toLowerCase();
    const minP = minPending === "" ? -Infinity : Number(minPending);
    const maxP = maxPending === "" ? Infinity : Number(maxPending);
    return base
      .filter((r) => brandF === "all" || r.po.brandId === brandF)
      .filter((r) => clientF === "all" || r.po.clientId === clientF)
      .filter((r) => !poT || r.po.poNumber.toLowerCase().includes(poT))
      .filter((r) => !dueFrom || r.po.deliveryDate >= dueFrom)
      .filter((r) => !dueTo || r.po.deliveryDate <= dueTo)
      .filter((r) => {
        if (daysF === "overdue") return r.daysLeft < 0;
        if (daysF === "dueSoon") return r.daysLeft >= 0 && r.daysLeft <= 10;
        if (daysF === "normal") return r.daysLeft > 10;
        return true;
      })
      .filter((r) => r.pending >= minP && r.pending <= maxP)
      .filter((r) => !t || [r.po.poNumber, brandName(r.po.brandId), clientName(r.po.clientId), STAGE_LABEL[stageFor(r.po)]].some((v) => v.toLowerCase().includes(t)))
      .sort((a, b) => {
        const s = dir === "asc" ? 1 : -1;
        switch (sortKey) {
          case "brand": return brandName(a.po.brandId).localeCompare(brandName(b.po.brandId)) * s;
          case "client": return clientName(a.po.clientId).localeCompare(clientName(b.po.clientId)) * s;
          case "poNumber": return a.po.poNumber.localeCompare(b.po.poNumber) * s;
          case "poDate": return a.po.poDate.localeCompare(b.po.poDate) * s;
          case "deliveryDate": return a.po.deliveryDate.localeCompare(b.po.deliveryDate) * s;
          case "daysLeft": return (a.daysLeft - b.daysLeft) * s;
          case "ordered": return (a.ordered - b.ordered) * s;
          case "dispatched": return (a.dispatched - b.dispatched) * s;
          case "pending": return (a.pending - b.pending) * s;
          case "stage": return STAGE_LABEL[stageFor(a.po)].localeCompare(STAGE_LABEL[stageFor(b.po)]) * s;
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, invoices, q, brandF, clientF, poF, dueFrom, dueTo, daysF, minPending, maxPending, sortKey, dir, brands, clients, yarn]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportRows = () => rows.map((r) => [
    brandName(r.po.brandId), clientName(r.po.clientId), r.po.poNumber, r.po.poDate, r.po.deliveryDate,
    daysRemainingLabel(r.daysLeft), r.ordered, r.dispatched, r.pending, STAGE_LABEL[stageFor(r.po)],
  ]);
  const headers = ["Brand", "Client", "PO Number", "PO Date", "Delivery Date", "Days Remaining", "Ordered Qty", "Dispatched Qty", "Pending Qty", "Procurement Stage"];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Pendency Report (PO Wise)"
        subtitle="Open Purchase Orders pending delivery"
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => { if (!rows.length) return toast.error("Nothing to export"); exportCSV("pendency-po.csv", headers, exportRows()); }}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" onClick={() => { if (!rows.length) return toast.error("Nothing to export"); exportXLSX("pendency-po.xlsx", "Pendency PO", headers, exportRows()); }}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 mb-4 print:hidden md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Global search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Input placeholder="PO Number contains…" value={poF} onChange={(e) => { setPoF(e.target.value); setPage(1); }} />
          <Select value={brandF} onValueChange={(v) => { setBrandF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={clientF} onValueChange={(v) => { setClientF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Delivery from</label>
            <Input type="date" value={dueFrom} onChange={(e) => { setDueFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Delivery to</label>
            <Input type="date" value={dueTo} onChange={(e) => { setDueTo(e.target.value); setPage(1); }} />
          </div>
          <Select value={daysF} onValueChange={(v) => { setDaysF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Days Remaining" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgencies</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="dueSoon">Due in ≤10 days</SelectItem>
              <SelectItem value="normal">More than 10 days</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Pending ≥</label>
            <Input type="number" value={minPending} onChange={(e) => { setMinPending(e.target.value); setPage(1); }} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Pending ≤</label>
            <Input type="number" value={maxPending} onChange={(e) => { setMaxPending(e.target.value); setPage(1); }} />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setBrandF("all"); setClientF("all"); setPoF(""); setDueFrom(""); setDueTo(""); setDaysF("all"); setMinPending(""); setMaxPending(""); setPage(1); }}>
              <X className="h-4 w-4 mr-1" /> Clear filters
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead><SortH label="Brand" k="brand" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Client" k="client" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="PO Number" k="poNumber" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="PO Date" k="poDate" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Delivery Date" k="deliveryDate" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Days Remaining" k="daysLeft" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="text-right"><SortH label="Ordered Qty" k="ordered" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="text-right"><SortH label="Dispatched Qty" k="dispatched" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="text-right"><SortH label="Pending Qty" k="pending" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="w-52"><SortH label="Procurement Stage" k="stage" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No pending POs</TableCell></TableRow>
              ) : pageRows.map((r: POPendency) => (
                <TableRow key={r.po.id} className={urgencyClass(r.daysLeft)}>
                  <TableCell>{brandName(r.po.brandId)}</TableCell>
                  <TableCell>{clientName(r.po.clientId)}</TableCell>
                  <TableCell>
                    <button className="font-medium text-primary hover:underline" onClick={() => setViewing(r.po)}>{r.po.poNumber}</button>
                  </TableCell>
                  <TableCell>{r.po.poDate}</TableCell>
                  <TableCell>{r.po.deliveryDate}</TableCell>
                  <TableCell className="whitespace-nowrap">{daysRemainingLabel(r.daysLeft)}</TableCell>
                  <TableCell className="text-right">{r.ordered}</TableCell>
                  <TableCell className="text-right">{r.dispatched}</TableCell>
                  <TableCell className="text-right font-medium">{r.pending}</TableCell>
                  <TableCell>
                    {(() => { const st = stageFor(r.po); return <Badge className={STAGE_BADGE[st]} variant="secondary">{STAGE_LABEL[st]}</Badge>; })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between mt-4 text-sm print:hidden">
          <div className="text-muted-foreground">Showing {pageRows.length} of {rows.length}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span>Page {safePage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewing?.poNumber} — Item Detail</DialogTitle></DialogHeader>
          {viewing && (
            <div className="overflow-x-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article Code</TableHead>
                    <TableHead>Lace Type</TableHead>
                    <TableHead>Material Type</TableHead>
                    <TableHead>Width (mm)</TableHead>
                    <TableHead>Length (cm)</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Dispatched</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Procurement Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poItemBreakdown(viewing, invoices).map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.articleCode || "—"}</TableCell>
                      <TableCell>{i.laceType || "—"}</TableCell>
                      <TableCell>{i.materialType || "—"}</TableCell>
                      <TableCell>{i.width || "—"}</TableCell>
                      <TableCell>{i.length || "—"}</TableCell>
                      <TableCell>{i.color || "—"}</TableCell>
                      <TableCell>{i.uom}</TableCell>
                      <TableCell className="text-right">{i.ordered}</TableCell>
                      <TableCell className="text-right">{i.dispatched}</TableCell>
                      <TableCell className="text-right font-medium">{i.pending}</TableCell>
                      <TableCell className="text-right">{i.rate}</TableCell>
                      <TableCell>
                        {(() => { const st = poItemStage(yarn, viewing, i); return <Badge className={STAGE_BADGE[st]} variant="secondary">{STAGE_LABEL[st]}</Badge>; })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}