import { supabase } from "@/integrations/supabase/client";
import { extractPoFromPdf } from "./extract-po-pdf.functions";

export type Conf = "high" | "medium" | "low";
export interface ConfVal<T = string> {
  value: T;
  confidence: Conf;
}

export interface ExtractionHeader {
  brandGuess: ConfVal<string | null>;
  clientGuess: ConfVal<string | null> & {
    address?: string | null;
    gstin?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  poNumber: ConfVal<string | null>;
  poDate: ConfVal<string | null>;
  deliveryDate: ConfVal<string | null>;
}

export interface ExtractionItem {
  rawDescription?: string;
  articleCode: ConfVal;
  laceType: ConfVal;
  materialType: ConfVal;
  width: ConfVal;
  length: ConfVal;
  color: ConfVal;
  uom: ConfVal;
  quantity: ConfVal<number>;
  rate: ConfVal<number>;
}

export interface Extraction {
  header: ExtractionHeader;
  items: ExtractionItem[];
}

export interface LearnedMapping {
  field: string;
  original_text: string;
  mapped_value: string;
  confirmations: number;
}

export const PDF_FIELDS_HEADER = ["brand", "client", "poNumber", "poDate", "deliveryDate"] as const;
export const PDF_FIELDS_ITEM = [
  "articleCode",
  "laceType",
  "materialType",
  "width",
  "length",
  "color",
  "uom",
  "quantity",
  "rate",
] as const;

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function uploadPdf(file: File, uid: string | undefined): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${uid ?? "anon"}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("po-pdfs").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function downloadPdf(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from("po-pdfs").download(path);
  if (error) throw error;
  return data;
}

export async function fetchMappings(clientName?: string): Promise<{
  global: LearnedMapping[];
  client: LearnedMapping[];
}> {
  const { data, error } = await supabase
    .from("description_mappings")
    .select("field, original_text, mapped_value, confirmations, enabled, clients(name)")
    .eq("enabled", true)
    .order("confirmations", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<
    LearnedMapping & { clients: { name: string } | null }
  >;
  const norm = clientName?.trim().toLowerCase();
  return {
    global: rows.filter((r) => !r.clients).map(strip),
    client: norm
      ? rows.filter((r) => r.clients && r.clients.name.toLowerCase() === norm).map(strip)
      : [],
  };
}
function strip(r: LearnedMapping & { clients?: unknown }): LearnedMapping {
  return {
    field: r.field,
    original_text: r.original_text,
    mapped_value: r.mapped_value,
    confirmations: r.confirmations,
  };
}

export async function extractFromPdf(opts: {
  fileBase64: string;
  fileName: string;
  hints: LearnedMapping[];
  clientHints: LearnedMapping[];
}): Promise<Extraction> {
  const result = (await extractPoFromPdf({ data: opts })) as { extraction: Extraction };
  if (!result?.extraction) throw new Error("Extraction failed");
  return result.extraction;
}

export interface PdfImportRow {
  id: string;
  file_path: string;
  file_name: string;
  client_id: string | null;
  po_id: string | null;
  po_number: string | null;
  status: string;
  extraction_json: Extraction | null;
  uploaded_by: string | null;
  uploaded_by_email: string | null;
  created_at: string;
}

export async function createPdfImport(input: {
  filePath: string;
  fileName: string;
  extraction: Extraction;
}): Promise<PdfImportRow> {
  const u = (await supabase.auth.getUser()).data.user;
  const { data, error } = await supabase
    .from("pdf_imports")
    .insert({
      file_path: input.filePath,
      file_name: input.fileName,
      extraction_json: input.extraction,
      po_number: input.extraction.header.poNumber.value,
      status: "extracted",
      uploaded_by: u?.id,
      uploaded_by_email: u?.email,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as PdfImportRow;
}

export async function updatePdfImport(
  id: string,
  patch: Partial<Pick<PdfImportRow, "client_id" | "po_id" | "po_number" | "status">>,
) {
  const { error } = await supabase.from("pdf_imports").update(patch).eq("id", id);
  if (error) throw error;
}

export async function listPdfImports(): Promise<PdfImportRow[]> {
  const { data, error } = await supabase
    .from("pdf_imports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as PdfImportRow[];
}

export async function deletePdfImport(row: PdfImportRow) {
  await supabase.storage.from("po-pdfs").remove([row.file_path]).catch(() => {});
  const { error } = await supabase.from("pdf_imports").delete().eq("id", row.id);
  if (error) throw error;
}

export async function recordCorrection(opts: {
  pdfImportId: string;
  clientId: string | null;
  field: string;
  originalValue: string;
  correctedValue: string;
}) {
  if (opts.originalValue === opts.correctedValue) return;
  const u = (await supabase.auth.getUser()).data.user;
  await supabase.from("learning_audit_log").insert({
    pdf_import_id: opts.pdfImportId,
    client_id: opts.clientId,
    field: opts.field,
    original_value: opts.originalValue,
    corrected_value: opts.correctedValue,
    user_id: u?.id,
    user_email: u?.email,
  });

  if (opts.originalValue?.trim() && opts.correctedValue?.trim()) {
    // upsert mapping (incr confirmations on conflict)
    let q = supabase
      .from("description_mappings")
      .select("id, confirmations")
      .eq("field", opts.field)
      .eq("original_text", opts.originalValue)
      .eq("mapped_value", opts.correctedValue);
    q = opts.clientId ? q.eq("client_id", opts.clientId) : q.is("client_id", null);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      await supabase
        .from("description_mappings")
        .update({ confirmations: (existing.confirmations ?? 1) + 1, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("description_mappings").insert({
        client_id: opts.clientId,
        field: opts.field,
        original_text: opts.originalValue,
        mapped_value: opts.correctedValue,
        confirmations: 1,
      });
    }
  }
}

export async function bumpClientProfile(clientId: string, corrections: number) {
  const { data: existing } = await supabase
    .from("client_extraction_profiles")
    .select("id, total_imports, total_corrections")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("client_extraction_profiles")
      .update({
        total_imports: (existing.total_imports ?? 0) + 1,
        total_corrections: (existing.total_corrections ?? 0) + corrections,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("client_extraction_profiles").insert({
      client_id: clientId,
      total_imports: 1,
      total_corrections: corrections,
    });
  }
}

export function confidenceClass(c: Conf | undefined): string {
  if (c === "low") return "bg-amber-500/15 border-amber-500/60 focus-visible:ring-amber-500/40";
  if (c === "medium") return "bg-amber-500/5 border-amber-500/30";
  return "";
}