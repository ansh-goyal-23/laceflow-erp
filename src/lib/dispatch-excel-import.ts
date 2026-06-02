import * as XLSX from "xlsx";

export interface DispatchImportRow {
  rowNumber: number;
  dispatchDate: string;
  invoiceNo: string;
  client: string;
  poNumber: string;
  articleCode: string;
  laceType: string;
  materialType: string;
  width: string;
  length: string;
  color: string;
  uom: string;
  dispatchQty: number;
  rate: number;
  errors: string[];
}

export interface DispatchParseResult {
  rows: DispatchImportRow[];
  validRows: DispatchImportRow[];
  invalidRows: DispatchImportRow[];
  uniqueInvoices: number;
}

const HEADER_MAP: Record<string, keyof Omit<DispatchImportRow, "rowNumber" | "errors">> = {
  dispatchdate: "dispatchDate",
  date: "dispatchDate",
  invoiceno: "invoiceNo",
  invoicenumber: "invoiceNo",
  invoice: "invoiceNo",
  client: "client",
  customer: "client",
  ponumber: "poNumber",
  poorder: "poNumber",
  poorderno: "poNumber",
  poorderumber: "poNumber",
  articlecode: "articleCode",
  lacetype: "laceType",
  materialtype: "materialType",
  width: "width",
  length: "length",
  color: "color",
  colour: "color",
  uom: "uom",
  unit: "uom",
  dispatchqty: "dispatchQty",
  qty: "dispatchQty",
  quantity: "dispatchQty",
  rate: "rate",
  price: "rate",
};

function normHeader(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function str(v: unknown): string { return v == null ? "" : String(v).trim(); }
function num(v: unknown): number {
  if (v == null || v === "") return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? NaN : n;
}
function toISODate(v: unknown): string {
  if (!v && v !== 0) return "";
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const p = new Date(s);
  return isNaN(p.getTime()) ? "" : p.toISOString().slice(0, 10);
}

export async function parseDispatchExcel(file: File): Promise<DispatchParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (!aoa.length) return { rows: [], validRows: [], invalidRows: [], uniqueInvoices: 0 };
  const header = aoa[0].map((h) => normHeader(String(h ?? "")));
  const colIndex: Partial<Record<keyof Omit<DispatchImportRow, "rowNumber" | "errors">, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key && colIndex[key] === undefined) colIndex[key] = i;
  });

  const rows: DispatchImportRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every((c) => c === "" || c == null)) continue;
    const get = (k: keyof Omit<DispatchImportRow, "rowNumber" | "errors">) =>
      colIndex[k] !== undefined ? r[colIndex[k]!] : "";
    const row: DispatchImportRow = {
      rowNumber: i + 1,
      dispatchDate: toISODate(get("dispatchDate")),
      invoiceNo: str(get("invoiceNo")),
      client: str(get("client")),
      poNumber: str(get("poNumber")),
      articleCode: str(get("articleCode")),
      laceType: str(get("laceType")),
      materialType: str(get("materialType")),
      width: str(get("width")),
      length: str(get("length")),
      color: str(get("color")),
      uom: str(get("uom")) || "Mtr",
      dispatchQty: (() => { const n = num(get("dispatchQty")); return isNaN(n) ? 0 : n; })(),
      rate: (() => { const n = num(get("rate")); return isNaN(n) ? 0 : n; })(),
      errors: [],
    };
    if (!row.invoiceNo) row.errors.push("Missing Invoice No");
    if (!row.dispatchDate) row.errors.push("Invalid/Missing Dispatch Date");
    if (!row.client) row.errors.push("Missing Client");
    if (!row.dispatchQty || row.dispatchQty <= 0) row.errors.push("Invalid Dispatch Qty");
    rows.push(row);
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);
  const uniqueInvoices = new Set(
    validRows.map((r) => `${r.client.toLowerCase()}||${r.invoiceNo}||${r.dispatchDate}`),
  ).size;
  return { rows, validRows, invalidRows, uniqueInvoices };
}

export function downloadFailedDispatchRows(rows: DispatchImportRow[], fileName = "failed_dispatch.xlsx") {
  const data = rows.map((r) => ({
    Row: r.rowNumber,
    "Dispatch Date": r.dispatchDate,
    "Invoice No": r.invoiceNo,
    Client: r.client,
    "PO Number": r.poNumber,
    "Article Code": r.articleCode,
    "Lace Type": r.laceType,
    "Material Type": r.materialType,
    Width: r.width,
    Length: r.length,
    Color: r.color,
    UOM: r.uom,
    "Dispatch Qty": r.dispatchQty,
    Rate: r.rate,
    Errors: r.errors.join("; "),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Failed");
  XLSX.writeFile(wb, fileName);
}