import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, ChevronLeft, X, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { parseDispatchExcel, downloadFailedDispatchRows, type DispatchImportRow, type DispatchParseResult } from "@/lib/dispatch-excel-import";
import { useStore, store, bulkImport, type PurchaseOrder, type POLineItem } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices/import")({
  component: ImportDispatchPage,
});

interface Result {
  totalRows: number;
  invoicesCreated: number;
  itemsCreated: number;
  failed: DispatchImportRow[];
  unlinkedItems: number;
}

type UnlinkedReason = "no-po" | "no-match" | "ambiguous";
interface UnlinkedRow {
  row: DispatchImportRow;
  reason: UnlinkedReason;
  candidates: number;
}

const REASON_LABEL: Record<UnlinkedReason, string> = {
  "no-po": "PO not found",
  "no-match": "No matching PO item",
  ambiguous: "Multiple matching PO items (ambiguous)",
};

function ImportDispatchPage() {
  const pos = useStore((s) => s.purchaseOrders);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<DispatchParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    if (!f.name.match(/\.xlsx?$/i)) { toast.error("Please upload an .xlsx file"); return; }
    setFile(f); setParsed(null); setResult(null); setParsing(true);
    try {
      const p = await parseDispatchExcel(f);
      setParsed(p);
      if (p.rows.length === 0) toast.warning("No data rows found");
      else toast.success(`Parsed ${p.rows.length} rows`);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to parse file");
      setFile(null);
    } finally { setParsing(false); }
  }

  function reset() {
    setFile(null); setParsed(null); setResult(null); setProgress(0); setProgressLabel("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function matchPOItem(po: PurchaseOrder, row: DispatchImportRow): POLineItem | undefined {
    const candidates = po.items.filter((it) =>
      (!row.articleCode || it.articleCode.trim().toLowerCase() === row.articleCode.trim().toLowerCase()) &&
      (!row.width || it.width.trim() === row.width.trim()) &&
      (!row.length || it.length.trim() === row.length.trim()) &&
      (!row.color || it.color.trim().toLowerCase() === row.color.trim().toLowerCase()),
    );
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  function poItemCandidates(po: PurchaseOrder, row: DispatchImportRow): POLineItem[] {
    return po.items.filter((it) =>
      (!row.articleCode || it.articleCode.trim().toLowerCase() === row.articleCode.trim().toLowerCase()) &&
      (!row.width || it.width.trim() === row.width.trim()) &&
      (!row.length || it.length.trim() === row.length.trim()) &&
      (!row.color || it.color.trim().toLowerCase() === row.color.trim().toLowerCase()),
    );
  }

  const unlinkedPreview: UnlinkedRow[] = parsed
    ? parsed.validRows.reduce<UnlinkedRow[]>((acc, r) => {
        const poMatch = pos.find((p) => p.poNumber === r.poNumber);
        if (!poMatch) {
          acc.push({ row: r, reason: "no-po", candidates: 0 });
          return acc;
        }
        const cands = poItemCandidates(poMatch, r);
        if (cands.length === 0) acc.push({ row: r, reason: "no-match", candidates: 0 });
        else if (cands.length > 1) acc.push({ row: r, reason: "ambiguous", candidates: cands.length });
        return acc;
      }, [])
    : [];

  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    setProgress(0);
    const failed: DispatchImportRow[] = [...parsed.invalidRows];
    let invoicesCreated = 0;
    let itemsCreated = 0;
    let unlinkedItems = 0;

    // Group by client+invoice+date
    const groups = new Map<string, { sample: DispatchImportRow; items: DispatchImportRow[] }>();
    for (const r of parsed.validRows) {
      const key = `${r.client.trim().toLowerCase()}||${r.invoiceNo}||${r.dispatchDate}`;
      const g = groups.get(key);
      if (g) g.items.push(r);
      else groups.set(key, { sample: r, items: [r] });
    }

    const total = groups.size;
    let done = 0;
    setProgressLabel(`Importing 0 of ${total} invoices…`);

    try {
      for (const { sample, items } of groups.values()) {
        try {
          const { id: clientId } = await bulkImport.ensureClient(sample.client);
          const lineItems = items.map((r) => {
            const po = pos.find((p) => p.poNumber === r.poNumber && p.clientId === clientId);
            const poItem = po ? matchPOItem(po, r) : undefined;
            if (!poItem) unlinkedItems++;
            return {
              poId: po?.id ?? null,
              poItemId: poItem?.id ?? null,
              poNumber: r.poNumber,
              articleCode: r.articleCode,
              laceType: r.laceType,
              materialType: r.materialType,
              width: r.width,
              length: r.length,
              color: r.color,
              uom: r.uom,
              dispatchQty: r.dispatchQty,
              rate: r.rate,
            };
          });
          await store.addInvoice({
            invoiceNumber: sample.invoiceNo,
            dispatchDate: sample.dispatchDate,
            clientId,
            items: lineItems,
          });
          invoicesCreated++;
          itemsCreated += lineItems.length;
        } catch (e) {
          const msg = (e as Error).message ?? "Unknown error";
          for (const it of items) failed.push({ ...it, errors: [msg] });
        }
        done++;
        setProgress(Math.round((done / total) * 100));
        setProgressLabel(`Importing ${done} of ${total} invoices…`);
      }
      setResult({ totalRows: parsed.rows.length, invoicesCreated, itemsCreated, failed, unlinkedItems });
      if (unlinkedItems > 0) {
        toast.warning(`Import complete: ${invoicesCreated} invoices, ${itemsCreated} items — ${unlinkedItems} not linked to a PO item`);
      } else {
        toast.success(`Import complete: ${invoicesCreated} invoices, ${itemsCreated} items`);
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Import Dispatch Excel"
        subtitle="Bulk upload dispatch invoices from an Excel file"
        actions={
          <Button variant="outline" asChild>
            <Link to="/invoices"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />

      {!file && (
        <Card>
          <CardContent className="p-8">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <div className="font-medium mb-1">Drag &amp; drop your Excel file here</div>
              <div className="text-sm text-muted-foreground mb-4">or click to browse (.xlsx)</div>
              <Button type="button" variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Choose File</Button>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            <div className="mt-6 text-sm text-muted-foreground">
              <div className="font-medium text-foreground mb-2">Expected columns:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                {["Dispatch Date","Invoice No","Client","PO Number","Article Code","Lace Type","Material Type","Width","Length","Color","UOM","Dispatch Qty","Rate"].map((c) => <div key={c}>• {c}</div>)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {file && parsing && <Card><CardContent className="p-8 text-center text-muted-foreground">Parsing {file.name}…</CardContent></Card>}

      {parsed && !result && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> {file?.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={reset} disabled={importing}><X className="h-4 w-4 mr-1" /> Remove</Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Stat label="Total Rows" value={parsed.rows.length} />
                <Stat label="Unique Invoices" value={parsed.uniqueInvoices} />
                <Stat label="Valid Rows" value={parsed.validRows.length} />
                <Stat label="Invalid Rows" value={parsed.invalidRows.length} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reset} disabled={importing}>Cancel</Button>
                <Button onClick={runImport} disabled={importing || parsed.validRows.length === 0}>
                  {importing ? "Importing…" : `Import ${parsed.uniqueInvoices} Invoices`}
                </Button>
              </div>
              {importing && <div className="mt-4 space-y-2"><Progress value={progress} /><div className="text-xs text-muted-foreground">{progressLabel}</div></div>}
            </CardContent>
          </Card>

          {parsed.invalidRows.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-4 w-4 text-destructive" />{parsed.invalidRows.length} invalid rows</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Invoice</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {parsed.invalidRows.slice(0, 100).map((r) => (
                        <TableRow key={r.rowNumber}>
                          <TableCell>{r.rowNumber}</TableCell><TableCell>{r.invoiceNo || "—"}</TableCell>
                          <TableCell className="text-destructive text-sm">{r.errors.join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => downloadFailedDispatchRows(parsed.invalidRows)}>
                  <Download className="h-4 w-4 mr-1" /> Download invalid rows
                </Button>
              </CardContent>
            </Card>
          )}

          {unlinkedPreview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  {unlinkedPreview.length} row{unlinkedPreview.length === 1 ? "" : "s"} will import without a PO item link
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-3">
                  These rows will still be imported, but <code>po_item_id</code> will be left NULL because the PO or a unique item match could not be found. Pendency reports for those items may be inaccurate until relinked.
                </div>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead>Article</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unlinkedPreview.slice(0, 100).map((u) => (
                        <TableRow key={`${u.row.rowNumber}-${u.reason}`}>
                          <TableCell>{u.row.rowNumber}</TableCell>
                          <TableCell>{u.row.invoiceNo || "—"}</TableCell>
                          <TableCell>{u.row.poNumber || "—"}</TableCell>
                          <TableCell>{u.row.articleCode || "—"}</TableCell>
                          <TableCell>{u.row.color || "—"}</TableCell>
                          <TableCell>{[u.row.width, u.row.length].filter(Boolean).join(" × ") || "—"}</TableCell>
                          <TableCell className="text-sm text-amber-700">
                            {REASON_LABEL[u.reason]}
                            {u.reason === "ambiguous" ? ` (${u.candidates})` : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {unlinkedPreview.length > 100 && (
                  <div className="text-xs text-muted-foreground mt-2">Showing first 100 of {unlinkedPreview.length}.</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Import Complete</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Total Rows" value={result.totalRows} />
              <Stat label="Invoices Created" value={result.invoicesCreated} />
              <Stat label="Items Created" value={result.itemsCreated} />
              <Stat label="Failed" value={result.failed.length} />
            </div>
            {result.unlinkedItems > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">{result.unlinkedItems}</span> item{result.unlinkedItems === 1 ? "" : "s"} were imported without a PO item link. Pendency reports may be inaccurate for these until you edit the invoice and re-select the PO item, or run the backfill script.
                </div>
              </div>
            )}
            {result.failed.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => downloadFailedDispatchRows(result.failed)}>
                <Download className="h-4 w-4 mr-1" /> Download failed rows
              </Button>
            )}
            <div className="flex gap-2"><Button onClick={reset}>Import Another</Button><Button variant="outline" asChild><Link to="/invoices">View Invoices</Link></Button></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}