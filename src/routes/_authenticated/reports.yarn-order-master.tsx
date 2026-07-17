import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X, FileSpreadsheet, Printer, Download } from "lucide-react";
import { useYarnStore, sampleReceiptItemColor } from "@/lib/yarn-store";
import { useStore } from "@/lib/store";
import { exportCSV, exportXLSX } from "@/lib/export-table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports/yarn-order-master")({
  component: YarnOrderMasterReport,
});

type OrderType = "Sample" | "Production";

interface Row {
  key: string;
  type: OrderType;
  orderNumber: string;
  orderDate: string;
  supplierId: string;
  supplier: string;
  clientId: string;
  client: string;
  poId: string;
  poNumber: string;
  material: string;
  color: string;
  shade: string;
  ordered: number;
  received: number;
  pending: number;
}

type SortKey =
  | "type" | "orderNumber" | "orderDate" | "supplier" | "client" | "poNumber"
  | "material" | "color" | "shade" | "ordered" | "received" | "pending";

const PAGE_SIZE = 25;

function SortH({ label, k, sortKey, dir, onClick, align }:
  { label: string; k: SortKey; sortKey: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; align?: "right" }) {
  const active = sortKey === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      onClick={() => onClick(k)}
      className={`flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground whitespace-nowrap ${align === "right" ? "ml-auto" : ""}`}
    >
      {label}<Icon className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
    </button>
  );
}

function YarnOrderMasterReport() {
  const store = useYarnStore((s) => s);
  const { sampleOrders, productionOrders, inwards, suppliers, shades } = store;
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "—";
  const poNumber = (id: string) => (id ? pos.find((p) => p.id === id)?.poNumber ?? "—" : "—");
  const shadeNoOf = (id?: string | null) => (id ? shades.find((s) => s.id === id)?.supplierShadeNumber ?? "" : "");

  // ---- Build rows ----
  const allRows = useMemo<Row[]>(() => {
    const rows: Row[] = [];

    // Sample rows (one per item)
    for (const o of sampleOrders) {
      for (const it of o.items) {
        let received = 0;
        for (const r of o.receipts) {
          const resolved = sampleReceiptItemColor(store, o, r);
          const targetId = r.sampleOrderItemId
            ?? (o.items.length === 1 ? o.items[0].id
              : o.items.find((x) => x.colorName === resolved.colorName && x.material === resolved.material)?.id);
          if (targetId !== it.id) continue;
          // net weight from matching inward item
          const inw = inwards.find((iw) =>
            iw.supplierId === o.supplierId &&
            iw.inwardDate === r.receiptDate &&
            iw.items.some((ii) =>
              (ii.supplierShadeNumber || "").trim().toLowerCase() === (r.supplierShadeNumber || "").trim().toLowerCase() &&
              (ii.lotNumber || "").trim().toLowerCase() === (r.lotNumber || "").trim().toLowerCase() &&
              Math.abs(ii.grossWeight - r.grossWeight) < 0.01 &&
              Math.abs(ii.cones - r.cones) < 0.5,
            ),
          );
          const inwItem = inw?.items.find((ii) =>
            (ii.supplierShadeNumber || "").trim().toLowerCase() === (r.supplierShadeNumber || "").trim().toLowerCase() &&
            (ii.lotNumber || "").trim().toLowerCase() === (r.lotNumber || "").trim().toLowerCase() &&
            Math.abs(ii.grossWeight - r.grossWeight) < 0.01 &&
            Math.abs(ii.cones - r.cones) < 0.5,
          );
          received += inwItem ? inwItem.netWeight : Math.max(0, r.grossWeight - r.cones * 0);
        }
        rows.push({
          key: `s-${o.id}-${it.id}`,
          type: "Sample",
          orderNumber: o.number,
          orderDate: o.orderDate,
          supplierId: o.supplierId,
          supplier: supplierName(o.supplierId),
          clientId: it.clientId,
          client: clientName(it.clientId),
          poId: o.linkedPoId ?? "",
          poNumber: poNumber(o.linkedPoId ?? ""),
          material: it.material,
          color: it.colorName,
          shade: shadeNoOf(it.approvedShadeId),
          ordered: it.approxQty,
          received: Number(received.toFixed(2)),
          pending: Number(Math.max(0, it.approxQty - received).toFixed(2)),
        });
      }
    }

    // Production rows (one per item)
    for (const o of productionOrders) {
      for (const it of o.items) {
        rows.push({
          key: `p-${o.id}-${it.id}`,
          type: "Production",
          orderNumber: o.number,
          orderDate: o.orderDate,
          supplierId: o.supplierId,
          supplier: supplierName(o.supplierId),
          clientId: it.clientId,
          client: clientName(it.clientId),
          poId: it.poId,
          poNumber: poNumber(it.poId),
          material: it.material,
          color: it.colorName,
          shade: it.supplierShadeNumber || shadeNoOf(it.approvedShadeId),
          ordered: it.orderedQty,
          received: Number(it.receivedQty.toFixed(2)),
          pending: Number(Math.max(0, it.orderedQty - it.receivedQty).toFixed(2)),
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleOrders, productionOrders, inwards, suppliers, shades, clients, pos]);

  // ---- Filters / sort / paging ----
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState<"all" | OrderType>("all");
  const [supplierF, setSupplierF] = useState("all");
  const [clientF, setClientF] = useState("all");
  const [poF, setPoF] = useState("all");
  const [colorF, setColorF] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("orderDate");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setDir("asc"); }
    setPage(1);
  };

  const colorOptions = useMemo(() => Array.from(new Set(allRows.map((r) => r.color).filter(Boolean))).sort(), [allRows]);
  const poOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) if (r.poId) m.set(r.poId, r.poNumber);
    return Array.from(m, ([id, num]) => ({ id, num })).sort((a, b) => a.num.localeCompare(b.num));
  }, [allRows]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const c = colorF.trim().toLowerCase();
    const filtered = allRows
      .filter((r) => typeF === "all" || r.type === typeF)
      .filter((r) => supplierF === "all" || r.supplierId === supplierF)
      .filter((r) => clientF === "all" || r.clientId === clientF)
      .filter((r) => poF === "all" || r.poId === poF)
      .filter((r) => !c || r.color.toLowerCase().includes(c))
      .filter((r) => !dateFrom || r.orderDate >= dateFrom)
      .filter((r) => !dateTo || r.orderDate <= dateTo)
      .filter((r) => !t || [r.type, r.orderNumber, r.supplier, r.client, r.poNumber, r.material, r.color, r.shade]
        .some((v) => (v ?? "").toString().toLowerCase().includes(t)));

    const s = dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * s;
      return String(va ?? "").localeCompare(String(vb ?? "")) * s;
    });
    return filtered;
  }, [allRows, q, typeF, supplierF, clientF, poF, colorF, dateFrom, dateTo, sortKey, dir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const headers = ["Type", "Order #", "Order Date", "Supplier", "Client", "PO", "Material", "Color", "Shade #", "Ordered", "Received", "Pending"];
  const exportRows = () => rows.map((r) => [
    r.type, r.orderNumber, r.orderDate, r.supplier, r.client, r.poNumber,
    r.material, r.color, r.shade, r.ordered, r.received, r.pending,
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px]">
      <PageHeader
        title="Yarn Order Master Report"
        subtitle="Consolidated view of all Sample and Production yarn orders"
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => { if (!rows.length) return toast.error("Nothing to export"); exportCSV("yarn-order-master.csv", headers, exportRows()); }}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button variant="outline" onClick={() => { if (!rows.length) return toast.error("Nothing to export"); exportXLSX("yarn-order-master.xlsx", "Yarn Order Master", headers, exportRows()); }}>
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
          <Select value={typeF} onValueChange={(v) => { setTypeF(v as "all" | OrderType); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Sample">Sample</SelectItem>
              <SelectItem value="Production">Production</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierF} onValueChange={(v) => { setSupplierF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={clientF} onValueChange={(v) => { setClientF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={poF} onValueChange={(v) => { setPoF(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="PO" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All POs</SelectItem>
              {poOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.num}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input list="color-options" placeholder="Color contains…" value={colorF} onChange={(e) => { setColorF(e.target.value); setPage(1); }} />
          <datalist id="color-options">{colorOptions.map((c) => <option key={c} value={c} />)}</datalist>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Order from</label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-muted-foreground w-24">Order to</label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => {
              setQ(""); setTypeF("all"); setSupplierF("all"); setClientF("all"); setPoF("all");
              setColorF(""); setDateFrom(""); setDateTo(""); setPage(1);
            }}>
              <X className="h-4 w-4 mr-1" /> Clear filters
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead><SortH label="Type" k="type" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Order #" k="orderNumber" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Order Date" k="orderDate" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Supplier" k="supplier" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Client" k="client" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="PO" k="poNumber" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Material" k="material" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Color" k="color" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead><SortH label="Shade #" k="shade" sortKey={sortKey} dir={dir} onClick={toggle} /></TableHead>
                <TableHead className="text-right"><SortH label="Ordered" k="ordered" sortKey={sortKey} dir={dir} onClick={toggle} align="right" /></TableHead>
                <TableHead className="text-right"><SortH label="Received" k="received" sortKey={sortKey} dir={dir} onClick={toggle} align="right" /></TableHead>
                <TableHead className="text-right"><SortH label="Pending" k="pending" sortKey={sortKey} dir={dir} onClick={toggle} align="right" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No matching yarn orders</TableCell></TableRow>
              ) : pageRows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <Badge variant={r.type === "Sample" ? "secondary" : "default"}>{r.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.orderNumber}</TableCell>
                  <TableCell>{r.orderDate}</TableCell>
                  <TableCell>{r.supplier}</TableCell>
                  <TableCell>{r.client}</TableCell>
                  <TableCell>{r.poNumber}</TableCell>
                  <TableCell>{r.material || "—"}</TableCell>
                  <TableCell>{r.color || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.shade || "—"}</TableCell>
                  <TableCell className="text-right">{r.ordered}</TableCell>
                  <TableCell className="text-right">{r.received}</TableCell>
                  <TableCell className={`text-right font-medium ${r.pending > 0 ? "" : "text-muted-foreground"}`}>{r.pending}</TableCell>
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