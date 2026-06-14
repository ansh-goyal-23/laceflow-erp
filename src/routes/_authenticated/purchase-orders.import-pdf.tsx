import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ChevronLeft, FileText, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useStore, store } from "@/lib/store";
import {
  bumpClientProfile,
  confidenceClass,
  createPdfImport,
  extractFromPdf,
  fetchMappings,
  fileToBase64,
  recordCorrection,
  updatePdfImport,
  uploadPdf,
  type Extraction,
  type ExtractionItem,
} from "@/lib/pdf-import";
import { supabase } from "@/integrations/supabase/client";
import { PdfImportGuard } from "@/components/pdf-import-guard";

export const Route = createFileRoute("/_authenticated/purchase-orders/import-pdf")({
  component: () => (
    <PdfImportGuard>
      <ImportPdfPage />
    </PdfImportGuard>
  ),
});

const UOMS = ["Mtr", "Pcs", "Pair", "Kg", "Roll"];

type EditableHeader = {
  brandId: string;
  clientId: string;
  poNumber: string;
  poDate: string;
  deliveryDate: string;
};

type EditableItem = ExtractionItem & { id: string };

function ItemRow({
  it,
  onChange,
  onDelete,
}: {
  it: EditableItem;
  onChange: (patch: Partial<EditableItem>) => void;
  onDelete: () => void;
}) {
  const cls = (key: keyof ExtractionItem) =>
    confidenceClass((it[key] as { confidence?: "high" | "medium" | "low" } | undefined)?.confidence);
  return (
    <TableRow>
      <TableCell>
        <Input
          className={cls("articleCode")}
          value={it.articleCode.value}
          onChange={(e) => onChange({ articleCode: { ...it.articleCode, value: e.target.value } })}
        />
      </TableCell>
      <TableCell>
        <Input
          className={cls("laceType")}
          value={it.laceType.value}
          onChange={(e) => onChange({ laceType: { ...it.laceType, value: e.target.value } })}
        />
      </TableCell>
      <TableCell>
        <Input
          className={cls("materialType")}
          value={it.materialType.value}
          onChange={(e) => onChange({ materialType: { ...it.materialType, value: e.target.value } })}
        />
      </TableCell>
      <TableCell>
        <Input
          className={cls("width")}
          value={it.width.value}
          onChange={(e) => onChange({ width: { ...it.width, value: e.target.value } })}
        />
      </TableCell>
      <TableCell>
        <Input
          className={cls("length")}
          value={it.length.value}
          onChange={(e) => onChange({ length: { ...it.length, value: e.target.value } })}
        />
      </TableCell>
      <TableCell>
        <Input
          className={cls("color")}
          value={it.color.value}
          onChange={(e) => onChange({ color: { ...it.color, value: e.target.value } })}
        />
      </TableCell>
      <TableCell>
        <Select
          value={it.uom.value || "Mtr"}
          onValueChange={(v) => onChange({ uom: { ...it.uom, value: v } })}
        >
          <SelectTrigger className={cls("uom")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UOMS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="any"
          className={cls("quantity")}
          value={Number(it.quantity.value) || ""}
          onChange={(e) =>
            onChange({ quantity: { ...it.quantity, value: parseFloat(e.target.value) || 0 } })
          }
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          step="any"
          className={cls("rate")}
          value={Number(it.rate.value) || ""}
          onChange={(e) => onChange({ rate: { ...it.rate, value: parseFloat(e.target.value) || 0 } })}
        />
      </TableCell>
      <TableCell>
        <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ConfBadge({ c }: { c?: "high" | "medium" | "low" }) {
  if (!c || c === "high") return null;
  return (
    <span
      title="Verify this value"
      className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs ml-1"
    >
      <AlertTriangle className="h-3 w-3" /> verify
    </span>
  );
}

function ImportPdfPage() {
  const navigate = useNavigate();
  const brands = useStore((s) => s.brands);
  const clients = useStore((s) => s.clients);
  const pos = useStore((s) => s.purchaseOrders);

  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [pdfImportId, setPdfImportId] = useState<string | null>(null);
  const [origSnapshot, setOrigSnapshot] = useState<Extraction | null>(null);

  const [header, setHeader] = useState<EditableHeader>({
    brandId: "",
    clientId: "",
    poNumber: "",
    poDate: "",
    deliveryDate: "",
  });
  const [items, setItems] = useState<EditableItem[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [duplicate, setDuplicate] = useState<{ poId: string; poNumber: string } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const brandConf = extraction?.header.brandGuess.confidence;
  const clientConf = extraction?.header.clientGuess.confidence;
  const poNumConf = extraction?.header.poNumber.confidence;
  const poDateConf = extraction?.header.poDate.confidence;
  const dlvConf = extraction?.header.deliveryDate.confidence;

  const total = useMemo(
    () =>
      items.reduce(
        (s, i) => s + (Number(i.quantity.value) || 0) * (Number(i.rate.value) || 0),
        0,
      ),
    [items],
  );

  async function handleExtract(f: File) {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }
    setFile(f);
    setExtracting(true);
    try {
      const u = (await supabase.auth.getUser()).data.user;
      const path = await uploadPdf(f, u?.id);
      const base64 = await fileToBase64(f);

      // Get hints based on file name as preliminary; we don't know client yet.
      const { global } = await fetchMappings();
      const ex = await extractFromPdf({
        fileBase64: base64,
        fileName: f.name,
        hints: global,
        clientHints: [],
      });

      // Persist import
      const row = await createPdfImport({ filePath: path, fileName: f.name, extraction: ex });
      setPdfImportId(row.id);
      setOrigSnapshot(JSON.parse(JSON.stringify(ex)));
      applyExtraction(ex);
      toast.success("Extraction complete — review below");
    } catch (e) {
      toast.error((e as Error).message ?? "Extraction failed");
      setFile(null);
    } finally {
      setExtracting(false);
    }
  }

  function applyExtraction(ex: Extraction) {
    setExtraction(ex);
    const brandMatch = ex.header.brandGuess.value
      ? brands.find(
          (b) => b.name.toLowerCase() === ex.header.brandGuess.value!.toLowerCase(),
        )
      : undefined;
    const clientMatch = ex.header.clientGuess.value
      ? clients.find(
          (c) => c.name.toLowerCase() === ex.header.clientGuess.value!.toLowerCase(),
        )
      : undefined;
    setHeader({
      brandId: brandMatch?.id ?? "",
      clientId: clientMatch?.id ?? "",
      poNumber: ex.header.poNumber.value ?? "",
      poDate: ex.header.poDate.value ?? new Date().toISOString().slice(0, 10),
      deliveryDate: ex.header.deliveryDate.value ?? "",
    });
    setNewClientName(
      !clientMatch && ex.header.clientGuess.value ? ex.header.clientGuess.value : "",
    );
    setItems(
      ex.items.map((it) => ({
        ...it,
        id: crypto.randomUUID(),
      })),
    );
  }

  function checkDuplicate(): { poId: string; poNumber: string } | null {
    if (!header.poNumber.trim() || !header.clientId) return null;
    const found = pos.find(
      (p) => p.poNumber === header.poNumber.trim() && p.clientId === header.clientId,
    );
    return found ? { poId: found.id, poNumber: found.poNumber } : null;
  }

  async function persistCorrections(savedClientId: string | null, savedPoId: string) {
    if (!pdfImportId || !origSnapshot || !extraction) return;
    let count = 0;
    const log = async (field: string, orig: unknown, curr: unknown) => {
      const a = String(orig ?? "").trim();
      const b = String(curr ?? "").trim();
      if (a === b) return;
      count++;
      await recordCorrection({
        pdfImportId,
        clientId: savedClientId,
        field,
        originalValue: a,
        correctedValue: b,
      });
    };

    await log("poNumber", origSnapshot.header.poNumber.value, header.poNumber);
    await log("poDate", origSnapshot.header.poDate.value, header.poDate);
    await log("deliveryDate", origSnapshot.header.deliveryDate.value, header.deliveryDate);
    await log(
      "brand",
      origSnapshot.header.brandGuess.value,
      brands.find((b) => b.id === header.brandId)?.name ?? "",
    );
    await log(
      "client",
      origSnapshot.header.clientGuess.value,
      clients.find((c) => c.id === header.clientId)?.name ?? newClientName,
    );

    const fields: (keyof ExtractionItem)[] = [
      "articleCode",
      "laceType",
      "materialType",
      "width",
      "length",
      "color",
      "uom",
      "quantity",
      "rate",
    ];
    items.forEach((curr, idx) => {
      const orig = origSnapshot.items[idx];
      if (!orig) return;
      fields.forEach((f) => {
        void log(f as string, (orig[f] as { value: unknown }).value, (curr[f] as { value: unknown }).value);
      });
    });

    if (savedClientId) await bumpClientProfile(savedClientId, count);
    await updatePdfImport(pdfImportId, {
      client_id: savedClientId,
      po_id: savedPoId,
      po_number: header.poNumber,
      status: "saved",
    });
  }

  async function ensureClientId(): Promise<string | null> {
    if (header.clientId) return header.clientId;
    if (!newClientName.trim()) {
      toast.error("Pick an existing client or enter a name for the detected new client");
      return null;
    }
    try {
      const nc = await store.addClient({
        name: newClientName.trim(),
        address: extraction?.header.clientGuess.address ?? "",
        gstNumber: extraction?.header.clientGuess.gstin ?? "",
        phone: extraction?.header.clientGuess.phone ?? "",
        email: extraction?.header.clientGuess.email ?? "",
      });
      setHeader((h) => ({ ...h, clientId: nc.id }));
      return nc.id;
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to create client");
      return null;
    }
  }

  async function handleSave(mode: "new" | "update" | "revision") {
    if (!header.brandId) {
      toast.error("Select a brand");
      return;
    }
    const clientId = await ensureClientId();
    if (!clientId) return;
    if (!header.poDate || !header.deliveryDate) {
      toast.error("PO Date and Delivery Date are required");
      return;
    }
    if (!items.length) {
      toast.error("Add at least one line item");
      return;
    }

    let poNumber = header.poNumber.trim();
    if (mode === "revision") {
      const base = poNumber.replace(/-R\d+$/i, "");
      const existingRevs = pos.filter(
        (p) => p.clientId === clientId && (p.poNumber === base || p.poNumber.startsWith(base + "-R")),
      );
      const maxRev = existingRevs.reduce((m, p) => {
        const r = /-R(\d+)$/i.exec(p.poNumber);
        return Math.max(m, r ? parseInt(r[1], 10) : 1);
      }, 1);
      poNumber = `${base}-R${maxRev + 1}`;
      setHeader((h) => ({ ...h, poNumber }));
    }

    try {
      const payload = {
        poNumber,
        brandId: header.brandId,
        clientId,
        poDate: header.poDate,
        deliveryDate: header.deliveryDate,
        items: items.map((it) => ({
          id: crypto.randomUUID(),
          articleCode: it.articleCode.value,
          laceType: it.laceType.value,
          materialType: it.materialType.value,
          width: it.width.value,
          length: it.length.value,
          color: it.color.value,
          uom: it.uom.value || "Mtr",
          quantity: Number(it.quantity.value) || 0,
          rate: Number(it.rate.value) || 0,
        })),
        status: "submitted" as const,
      };

      let poId: string;
      if (mode === "update" && duplicate) {
        await store.updatePO(duplicate.poId, payload);
        poId = duplicate.poId;
      } else {
        const created = await store.addPO(payload);
        poId = created.id;
      }
      await persistCorrections(clientId, poId);
      toast.success(mode === "update" ? "PO updated" : "PO saved");
      navigate({ to: "/purchase-orders" });
    } catch (e) {
      toast.error((e as Error).message ?? "Save failed");
    }
  }

  function onSubmit() {
    const dup = checkDuplicate();
    if (dup) {
      setDuplicate(dup);
      return;
    }
    void handleSave("new");
  }

  // ============ UPLOAD PHASE ============
  if (!extraction) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl">
        <PageHeader
          title="Import PDF PO"
          subtitle="Upload a customer Purchase Order PDF. AI will extract the data for you to review."
          actions={
            <Button variant="outline" asChild>
              <Link to="/purchase-orders">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="p-8">
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleExtract(f);
              }}
              className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:bg-muted/40 transition-colors"
            >
              {extracting ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <div className="font-medium text-foreground">Analyzing PDF with AI…</div>
                  <div className="text-sm">{file?.name}</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Upload className="h-10 w-10 text-primary" />
                  <div className="text-base font-medium text-foreground">
                    Drop a PDF here or click to browse
                  </div>
                  <div className="text-sm">Digital or scanned Purchase Order, one file at a time</div>
                </div>
              )}
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleExtract(f);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ REVIEW PHASE ============
  return (
    <div className="p-6 lg:p-8 max-w-7xl space-y-6">
      <PageHeader
        title="Review Extracted PO"
        subtitle={file?.name}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setExtraction(null);
              setFile(null);
              setItems([]);
              setPdfImportId(null);
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Upload another
          </Button>
        }
      />

      {brandConf !== "high" && !header.brandId && (
        <div className="flex items-center gap-2 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          Brand could not be confidently identified. Please select one below.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>PO Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>
              Brand <ConfBadge c={brandConf} />
            </Label>
            <Select value={header.brandId} onValueChange={(v) => setHeader((h) => ({ ...h, brandId: v }))}>
              <SelectTrigger className={confidenceClass(brandConf)}>
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Client <ConfBadge c={clientConf} />
            </Label>
            <Select
              value={header.clientId}
              onValueChange={(v) => setHeader((h) => ({ ...h, clientId: v }))}
            >
              <SelectTrigger className={confidenceClass(clientConf)}>
                <SelectValue
                  placeholder={newClientName ? `(new) ${newClientName}` : "Select existing client"}
                />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!header.clientId && newClientName && (
              <div className="text-xs flex items-center gap-2 bg-primary/10 border border-primary/30 text-foreground rounded-md p-2">
                <span className="font-medium">New Client Detected:</span>
                <Input
                  className="h-7"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                />
                <span className="text-muted-foreground">will be created on Save</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              PO Number <ConfBadge c={poNumConf} />
            </Label>
            <Input
              className={confidenceClass(poNumConf)}
              value={header.poNumber}
              onChange={(e) => setHeader((h) => ({ ...h, poNumber: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>
              PO Date <ConfBadge c={poDateConf} />
            </Label>
            <Input
              type="date"
              className={confidenceClass(poDateConf)}
              value={header.poDate}
              onChange={(e) => setHeader((h) => ({ ...h, poDate: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Delivery Date <ConfBadge c={dlvConf} />
            </Label>
            <Input
              type="date"
              className={confidenceClass(dlvConf)}
              value={header.deliveryDate}
              onChange={(e) => setHeader((h) => ({ ...h, deliveryDate: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setItems((arr) => [
                ...arr,
                {
                  id: crypto.randomUUID(),
                  articleCode: { value: "", confidence: "high" },
                  laceType: { value: "", confidence: "high" },
                  materialType: { value: "", confidence: "high" },
                  width: { value: "", confidence: "high" },
                  length: { value: "", confidence: "high" },
                  color: { value: "", confidence: "high" },
                  uom: { value: "Mtr", confidence: "high" },
                  quantity: { value: 0, confidence: "high" },
                  rate: { value: 0, confidence: "high" },
                },
              ])
            }
          >
            <Plus className="h-4 w-4 mr-1" /> Add Row
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">Article Code</TableHead>
                  <TableHead className="min-w-32">Lace Type</TableHead>
                  <TableHead className="min-w-32">Material Type</TableHead>
                  <TableHead className="w-24">Width</TableHead>
                  <TableHead className="w-24">Length</TableHead>
                  <TableHead className="min-w-28">Color</TableHead>
                  <TableHead className="w-24">UOM</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                  <TableHead className="w-28">Rate</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <ItemRow
                    key={it.id}
                    it={it}
                    onChange={(patch) =>
                      setItems((arr) => arr.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))
                    }
                    onDelete={() => setItems((arr) => arr.filter((x) => x.id !== it.id))}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex justify-end text-sm">
            <div className="bg-muted px-4 py-2 rounded-md">
              <span className="text-muted-foreground mr-2">Total:</span>
              <span className="font-semibold text-base">{total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> Fields highlighted in amber were extracted with low or medium confidence.
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/purchase-orders" })}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>
            <Save className="h-4 w-4 mr-1" /> Save PO
          </Button>
        </div>
      </div>

      <AlertDialog open={!!duplicate} onOpenChange={(o) => !o && setDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existing PO Found</AlertDialogTitle>
            <AlertDialogDescription>
              A PO with number <span className="font-medium">{duplicate?.poNumber}</span> already exists for this client.
              How do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Cancel Import</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => {
                setDuplicate(null);
                void handleSave("update");
              }}
            >
              Update Existing PO
            </Button>
            <AlertDialogAction
              onClick={() => {
                setDuplicate(null);
                void handleSave("revision");
              }}
            >
              Create New Revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}