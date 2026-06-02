import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, FileSpreadsheet, ChevronLeft, X, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { parseExcel, downloadFailedRows, type ImportRow, type ParseResult } from "@/lib/excel-import";
import { bulkImport, type DuplicateStrategy } from "@/lib/store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/purchase-orders/import")({
  component: ImportExcelPage,
});

interface ImportResult {
  totalRows: number;
  posCreated: number;
  posUpdated: number;
  lineItemsCreated: number;
  brandsCreated: number;
  clientsCreated: number;
  failed: ImportRow[];
}

function ImportExcelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    if (!f.name.match(/\.xlsx?$/i)) {
      toast.error("Please upload an .xlsx file");
      return;
    }
    setFile(f);
    setParsed(null);
    setResult(null);
    setParsing(true);
    try {
      const p = await parseExcel(f);
      setParsed(p);
      if (p.rows.length === 0) toast.warning("No data rows found in the file");
      else toast.success(`Parsed ${p.rows.length} rows`);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to parse file");
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setFile(null);
    setParsed(null);
    setResult(null);
    setProgress(0);
    setProgressLabel("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    setProgress(0);
    setResult(null);
    const failed: ImportRow[] = [...parsed.invalidRows];
    let posCreated = 0;
    let posUpdated = 0;
    let lineItemsCreated = 0;
    let brandsCreated = 0;
    let clientsCreated = 0;

    // Group rows by the database uniqueness rule: one PO number per client.
    // Multiple Excel rows for the same client + PO are imported as line items.
    const groups = new Map<string, { sample: ImportRow; items: ImportRow[] }>();
    for (const r of parsed.validRows) {
      const key = `${r.client.trim().toLowerCase()}||${r.poNumber.trim()}`;
      const g = groups.get(key);
      if (g) g.items.push(r);
      else groups.set(key, { sample: r, items: [r] });
    }

    const total = groups.size;
    let done = 0;
    setProgressLabel(`Importing 0 of ${total} purchase orders…`);

    try {
      // Ensure brands/clients (sequential to avoid duplicate creation)
      const brandIds = new Map<string, string>();
      const clientIds = new Map<string, string>();
      const allBrands = Array.from(
        new Set(parsed.validRows.map((r) => (r.brand.trim() ? r.brand : "Unbranded"))),
      );
      const allClients = Array.from(new Set(parsed.validRows.map((r) => r.client)));
      for (const b of allBrands) {
        const { id, created } = await bulkImport.ensureBrand(b);
        brandIds.set(b.toLowerCase(), id);
        if (created) brandsCreated++;
      }
      for (const c of allClients) {
        const { id, created } = await bulkImport.ensureClient(c);
        clientIds.set(c.toLowerCase(), id);
        if (created) clientsCreated++;
      }

      for (const { sample, items } of groups.values()) {
        try {
          const brandKey = (sample.brand.trim() ? sample.brand : "Unbranded").toLowerCase();
          const brandId = brandIds.get(brandKey)!;
          const clientId = clientIds.get(sample.client.toLowerCase())!;
          const lineItems = items.map((i) => ({
            articleCode: i.articleCode,
            laceType: i.laceType,
            materialType: i.materialType,
            width: i.width,
            length: i.length,
            color: i.color,
            uom: i.uom,
            quantity: i.quantity,
            rate: 0,
          }));

          const existing = bulkImport.findPOByNumber(sample.poNumber, clientId);
          if (existing) {
            if (duplicateStrategy === "skip") {
              for (const it of items) failed.push({ ...it, errors: [`PO ${sample.poNumber} exists — skipped`] });
            } else if (duplicateStrategy === "update") {
              const n = await bulkImport.appendItemsToPO(existing.id, lineItems);
              lineItemsCreated += n;
              posUpdated++;
            } else {
              const n = await bulkImport.replacePO(existing.id, {
                poNumber: sample.poNumber, brandId, clientId,
                poDate: sample.poDate, deliveryDate: sample.deliveryDate,
                items: lineItems,
              });
              lineItemsCreated += n;
              posUpdated++;
            }
          } else {
            const { itemCount } = await bulkImport.createPO({
              poNumber: sample.poNumber, brandId, clientId,
              poDate: sample.poDate, deliveryDate: sample.deliveryDate,
              items: lineItems,
            });
            posCreated++;
            lineItemsCreated += itemCount;
          }
        } catch (e) {
          const msg = (e as Error).message ?? "Unknown error";
          for (const it of items) failed.push({ ...it, errors: [msg] });
        }
        done++;
        setProgress(Math.round((done / total) * 100));
        setProgressLabel(`Importing ${done} of ${total} purchase orders…`);
      }

      const final: ImportResult = {
        totalRows: parsed.rows.length,
        posCreated, posUpdated, lineItemsCreated, brandsCreated, clientsCreated, failed,
      };
      setResult(final);

      await bulkImport.logImport({
        fileName: file?.name ?? "import.xlsx",
        totalRows: final.totalRows,
        successfulRows: parsed.validRows.length - failed.filter((f) => f.errors.some((e) => e.includes("skipped") || e.includes("exists"))).length,
        failedRows: failed.length,
        posCreated, posUpdated, lineItemsCreated, brandsCreated, clientsCreated,
        status: failed.length === 0 ? "completed" : "completed_with_errors",
        errors: failed.slice(0, 500).map((f) => ({ row: f.rowNumber, errors: f.errors })),
      });

      toast.success(`Import complete: ${posCreated} created, ${posUpdated} updated`);
    } catch (e) {
      toast.error((e as Error).message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <PageHeader
        title="Import Excel"
        subtitle="Bulk upload historical purchase orders from an Excel file"
        actions={
          <Button variant="outline" asChild>
            <Link to="/purchase-orders"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />

      {!file && (
        <Card>
          <CardContent className="p-8">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <div className="font-medium mb-1">Drag &amp; drop your Excel file here</div>
              <div className="text-sm text-muted-foreground mb-4">or click to browse (.xlsx)</div>
              <Button type="button" variant="outline" size="sm">
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Choose File
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
            <div className="mt-6 text-sm text-muted-foreground">
              <div className="font-medium text-foreground mb-2">Expected columns:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
                {["Brand","Client","P.O Order","P.O Date","Delivery date","Article Code","Lace Type","Material Type","Width","Length","Color","UOM","Actual Qty"].map((c) => (
                  <div key={c}>• {c}</div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {file && parsing && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Parsing {file.name}…</CardContent></Card>
      )}

      {parsed && !result && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" /> {file?.name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={reset} disabled={importing}>
                <X className="h-4 w-4 mr-1" /> Remove
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <Stat label="Total Rows" value={parsed.rows.length} />
                <Stat label="Unique POs" value={parsed.uniquePOs} />
                <Stat label="Brands" value={parsed.brands.length} />
                <Stat label="Clients" value={parsed.clients.length} />
                <Stat label="Invalid Rows" value={parsed.invalidRows.length} tone={parsed.invalidRows.length ? "warn" : "ok"} />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">If PO Number already exists</div>
                  <Select value={duplicateStrategy} onValueChange={(v) => setDuplicateStrategy(v as DuplicateStrategy)}>
                    <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip Existing PO</SelectItem>
                      <SelectItem value="update">Update Existing PO (append items)</SelectItem>
                      <SelectItem value="replace">Replace Existing PO Completely</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1" />
                <Button variant="outline" onClick={reset} disabled={importing}>Cancel</Button>
                <Button onClick={runImport} disabled={importing || parsed.validRows.length === 0}>
                  {importing ? "Importing…" : `Import ${parsed.uniquePOs} POs`}
                </Button>
              </div>

              {importing && (
                <div className="mt-4 space-y-2">
                  <Progress value={progress} />
                  <div className="text-xs text-muted-foreground">{progressLabel}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {parsed.invalidRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  {parsed.invalidRows.length} row{parsed.invalidRows.length === 1 ? "" : "s"} will be skipped due to validation errors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Row</TableHead><TableHead>PO #</TableHead><TableHead>Errors</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.invalidRows.slice(0, 100).map((r) => (
                        <TableRow key={r.rowNumber}>
                          <TableCell>{r.rowNumber}</TableCell>
                          <TableCell>{r.poNumber || "—"}</TableCell>
                          <TableCell className="text-destructive text-sm">{r.errors.join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => downloadFailedRows(parsed.invalidRows, "invalid_rows.xlsx")}>
                  <Download className="h-4 w-4 mr-1" /> Download invalid rows
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Preview (first 50 rows)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-md max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>PO #</TableHead>
                      <TableHead>PO Date</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Article</TableHead>
                      <TableHead>Color</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 50).map((r) => (
                      <TableRow key={r.rowNumber} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <TableCell>{r.rowNumber}</TableCell>
                        <TableCell>{r.brand || "—"}</TableCell>
                        <TableCell>{r.client || "—"}</TableCell>
                        <TableCell>{r.poNumber || "—"}</TableCell>
                        <TableCell>{r.poDate || "—"}</TableCell>
                        <TableCell>{r.deliveryDate || "—"}</TableCell>
                        <TableCell>{r.articleCode || "—"}</TableCell>
                        <TableCell>{r.color || "—"}</TableCell>
                        <TableCell>{r.uom}</TableCell>
                        <TableCell className="text-right">{r.quantity || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Stat label="Total Rows" value={result.totalRows} />
              <Stat label="POs Created" value={result.posCreated} tone="ok" />
              <Stat label="POs Updated" value={result.posUpdated} />
              <Stat label="Line Items" value={result.lineItemsCreated} />
              <Stat label="Brands Created" value={result.brandsCreated} />
              <Stat label="Clients Created" value={result.clientsCreated} />
            </div>

            {result.failed.length > 0 && (
              <div>
                <div className="font-medium mb-2 flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" /> {result.failed.length} failed row{result.failed.length === 1 ? "" : "s"}
                </div>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Row</TableHead><TableHead>PO #</TableHead><TableHead>Errors</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.failed.slice(0, 100).map((r) => (
                        <TableRow key={`${r.rowNumber}-${r.errors[0]}`}>
                          <TableCell>{r.rowNumber}</TableCell>
                          <TableCell>{r.poNumber || "—"}</TableCell>
                          <TableCell className="text-destructive text-sm">{r.errors.join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => downloadFailedRows(result.failed)}>
                  <Download className="h-4 w-4 mr-1" /> Download failed rows
                </Button>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Import Another File</Button>
              <Button asChild><Link to="/purchase-orders">View Purchase Orders</Link></Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const color =
    tone === "ok" ? "text-primary" : tone === "warn" ? "text-destructive" : "text-foreground";
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}