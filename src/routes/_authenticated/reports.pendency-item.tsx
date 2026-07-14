import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, store } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X, Download, FileSpreadsheet, Printer } from "lucide-react";
import {
  computeItemPendencies, daysRemainingLabel, urgencyClass, urgencyGroup, PRODUCTION_STATUSES, type ItemPendency,
} from "@/lib/reports";
import { useYarnStore, poItemStage, STAGE_LABEL, STAGE_BADGE } from "@/lib/yarn-store";
import { Badge } from "@/components/ui/badge";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports/pendency-item")({
  component: PendencyItemReport,
});

const PAGE_SIZE = 25;

type SortKey = "client" | "poNumber" | "daysLeft" | "articleCode" | "laceType" | "materialType" | "width" | "length" | "color" | "uom" | "pending" | "prod" | "stage";

function SortH({ label, k, sortKey, dir, onClick }: { label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = sortKey === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button onClick={() => onClick(k)} className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground whitespace-nowrap">
      {label}<Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );
}

function PendencyItemReport() {
  const pos = useStore((s) => s.purchaseOrders);
  const invoices = useStore((s) => s.invoices);
  const clients = useStore((s) => s.clients);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const yarn = useYarnStore((s) => s);
  const stageForItem = (r: ItemPendency) => {
    const item = r.po.items.find((i) => i.id === r.itemId);
    return item ? poItemStage(yarn, r.po, item) : "waiting_for_yarn_order" as const;
  };

  const [q, setQ] = useState("");
  const [clientF, setClientF] = useState("all");
  const [poF, setPoF] = useState("");
  const [article, setArticle] = useState("");
  const [lace, setLace] = useState("");
  const [material, setMaterial] = useState("");
  const [width, setWidth] = useState("");
  const [color, setColor] = useState("");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [daysF, setDaysF] = useState("all");
  const [prodF, setProdF] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const toggle = (k: SortKey) => { if (sortKey === k) setDir((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setDir("asc"); } setPage(1); };

  const rows = useMemo(() => {
    const base = computeItemPendencies(pos, invoices);
    const t = q.toLowerCase();
    const mn = minP === "" ? -Infinity : Number(minP);
    const mx = maxP === "" ? Infinity : Number(maxP);
    const list = base
      .filter((r) => clientF === "all" || r.po.clientId === clientF)
      .filter((r) => !poF || r.po.poNumber.toLowerCase().includes(poF.toLowerCase()))
      .filter((r) => !article || r.articleCode.toLowerCase().includes(article.toLowerCase()))
      .filter((r) => !lace || r.laceType.toLowerCase().includes(lace.toLowerCase()))
      .filter((r) => !material || r.materialType.toLowerCase().includes(material.toLowerCase()))
      .filter((r) => !width || r.width.toLowerCase().includes(width.toLowerCase()))
      .filter((r) => !color || r.color.toLowerCase().includes(color.toLowerCase()))
      .filter((r) => r.pending >= mn && r.pending <= mx)
      .filter((r) => {
        if (daysF === "overdue") return r.daysLeft < 0;
        if (daysF === "dueSoon") return r.daysLeft >= 0 && r.daysLeft <= 10;
        if (daysF === "normal") return r.daysLeft > 10;
        return true;
      })
      .filter((r) => prodF === "all" || (r.po.productionStatus ?? "") === prodF)
      .filter((r) => !t || [clientName(r.po.clientId), r.po.poNumber, r.articleCode, r.laceType, r.color].some((v) => v.toLowerCase().includes(t)));

    if (sortKey) {
      const s = dir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        switch (sortKey) {
          case "client": return clientName(a.po.clientId).localeCompare(clientName(b.po.clientId)) * s;
          case "poNumber": return a.po.poNumber.localeCompare(b.po.poNumber) * s;
          case "daysLeft": return (a.daysLeft - b.daysLeft) * s;
          case "articleCode": return a.articleCode.localeCompare(b.articleCode) * s;
          case "laceType": return a.laceType.localeCompare(b.laceType) * s;
          case "materialType": return a.materialType.localeCompare(b.materialType) * s;
          case "width": return a.width.localeCompare(b.width) * s;
          case "length": return a.length.localeCompare(b.length) * s;
          case "color": return a.color.localeCompare(b.color) * s;
          case "uom": return a.uom.localeCompare(b.uom) * s;
          case "pending": return (a.pending - b.pending) * s;
          case "prod": return (a.po.productionStatus ?? "").localeCompare(b.po.productionStatus ?? "") * s;
          case "stage": return STAGE_LABEL[stageForItem(a)].localeCompare(STAGE_LABEL[stageForItem(b)]) * s;
        }
      });
    } else {
      // default: urgency group asc, then delivery date asc
      list.sort((a, b) => {
        const g = urgencyGroup(a.daysLeft) - urgencyGroup(b.daysLeft);
        if (g !== 0) return g;
        return a.po.deliveryDate.localeCompare(b.po.deliveryDate);
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, invoices, q, clientF, poF, article, lace, material, width, color, minP, maxP, daysF, prodF, sortKey, dir, clients, yarn]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const headers = ["Client", "PO Number", "Days Remaining", "Article Code", "Lace Type", "Material Type", "Width", "Length", "Color", "UOM", "Pending Qty", "Procurement Stage", "Production Status"];
  const exportRows = () => rows.map((r) => [
    clientName(r.po.clientId), r.po.poNumber, daysRemainingLabel(r.daysLeft),
    r.articleCode, r.laceType, r.materialType, r.width, r.length, r.color, r.uom, r.pending, STAGE_LABEL[stageForItem(r)], r.po.productionStatus ?? "",
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Pendency Report (Item Wise)"
        subtitle="All pending items across Open POs — sorted by urgency"
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => { if (!rows.length) return toast.error("Nothing to export"); exportCSV("pendency-item.csv", headers, exportRows()); }}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" onClick={() => { if (!rows.length) return toast.error("Nothing to export"); exportXLSX("pendency-item.xlsx", "Pendency Items", headers, exportRows()); }}>
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
          <Select value={clientF} onValueChange={(v) => { setClientF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="PO Number" value={poF} onChange={(e) => { setPoF(e.target.value); setPage(1); }} />
          <Input placeholder="Article Code" value={article} onChange={(e) => { setArticle(e.target.value); setPage(1); }} />
          <Input placeholder="Lace Type" value={lace} onChange={(e) => { setLace(e.target.value); setPage(1); }} />
          <Input placeholder="Material Type" value={material} onChange={(e) => { setMaterial(e.target.value); setPage(1); }} />
          <Input placeholder="Width" value={width} onChange={(e) => { setWidth(e.target.value); setPage(1); }} />
          <Input placeholder="Color" value={color} onChange={(e) => { setColor(e.target.value); setPage(1); }} />
          <Select value={daysF} onValueChange={(v) => { setDaysF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Days Remaining" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgencies</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="dueSoon">Due in ≤10 days</SelectItem>
              <SelectItem value="normal">More than 10 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={prodF} onValueChange={(v) => { setProdF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Production Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Production Statuses</SelectItem>
              {PRODUCTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Pending ≥</label>
            <Input type="number" value={minP} onChange={(e) => { setMinP(e.target.value); setPage(1); }} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Pending ≤</label>
            <Input type="number" value={maxP} onChange={(e) => { setMaxP(e.target.value); setPage(1); }} />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setClientF("all"); setPoF(""); setArticle(""); setLace(""); setMaterial(""); setWidth(""); setColor(""); setMinP(""); setMaxP(""); setDaysF("all"); setProdF("all"); setSortKey(null); setPage(1); }}>
              <X className="h-4 w-4 mr-1" /> Clear filters
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead><SortH label="Client" k="client" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="PO Number" k="poNumber" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Days Remaining" k="daysLeft" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Article Code" k="articleCode" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Lace Type" k="laceType" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Material Type" k="materialType" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Width" k="width" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Length" k="length" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Color" k="color" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="UOM" k="uom" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="text-right"><SortH label="Pending Qty" k="pending" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="w-52"><SortH label="Procurement Stage" k="stage" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="w-56"><SortH label="Production Status" k="prod" sortKey={sortKey ?? "client"} dir={dir} onClick={toggle} /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No pending items</TableCell></TableRow>
              ) : pageRows.map((r: ItemPendency) => (
                <TableRow key={r.itemId} className={urgencyClass(r.daysLeft)}>
                  <TableCell>{clientName(r.po.clientId)}</TableCell>
                  <TableCell className="font-medium">{r.po.poNumber}</TableCell>
                  <TableCell className="whitespace-nowrap">{daysRemainingLabel(r.daysLeft)}</TableCell>
                  <TableCell>{r.articleCode || "—"}</TableCell>
                  <TableCell>{r.laceType || "—"}</TableCell>
                  <TableCell>{r.materialType || "—"}</TableCell>
                  <TableCell>{r.width || "—"}</TableCell>
                  <TableCell>{r.length || "—"}</TableCell>
                  <TableCell>{r.color || "—"}</TableCell>
                  <TableCell>{r.uom}</TableCell>
                  <TableCell className="text-right font-medium">{r.pending}</TableCell>
                  <TableCell>
                    {(() => { const st = stageForItem(r); return <Badge className={STAGE_BADGE[st]} variant="secondary">{STAGE_LABEL[st]}</Badge>; })()}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={r.po.productionStatus ?? "__none"}
                      onValueChange={async (v) => {
                        try { await store.updateProductionStatus(r.po.id, v === "__none" ? null : v); toast.success("Production status updated"); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                      }}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">—</SelectItem>
                        {PRODUCTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
    </div>
  );
}