import * as XLSX from "xlsx";

export interface ImportRow {
  rowNumber: number; // 1-based excel row (header = 1, first data = 2)
  brand: string;
  client: string;
  poNumber: string;
  poDate: string; // YYYY-MM-DD
  deliveryDate: string;
  articleCode: string;
  laceType: string;
  materialType: string;
  width: string;
  length: string;
  color: string;
  uom: string;
  quantity: number;
  errors: string[];
}

export interface ParseResult {
  rows: ImportRow[];
  validRows: ImportRow[];
  invalidRows: ImportRow[];
  uniquePOs: number;
  brands: string[];
  clients: string[];
}

// Acceptable header variants (lowercased, trimmed, non-alnum stripped)
const HEADER_MAP: Record<string, keyof Omit<ImportRow, "rowNumber" | "errors">> = {
  brand: "brand",
  client: "client",
  customer: "client",
  poorder: "poNumber",
  poordernumber: "poNumber",
  ponumber: "poNumber",
  poorderno: "poNumber",
  podate: "poDate",
  poorderdate: "poDate",
  deliverydate: "deliveryDate",
  articlecode: "articleCode",
  lacetype: "laceType",
  materialtype: "materialType",
  width: "width",
  length: "length",
  color: "color",
  colour: "color",
  uom: "uom",
  unit: "uom",
  actualqty: "quantity",
  qty: "quantity",
  quantity: "quantity",
};

function normHeader(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function toISODate(v: unknown): string {
  if (!v && v !== 0) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(v).trim();
  if (!s) return "";
  // Try common formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = (parseInt(y, 10) > 50 ? "19" : "20") + y;
    // assume DD/MM/YYYY (Indian)
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? NaN : n;
}

export async function parseExcel(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (!aoa.length) {
    return { rows: [], validRows: [], invalidRows: [], uniquePOs: 0, brands: [], clients: [] };
  }
  const header = aoa[0].map((h) => normHeader(String(h ?? "")));
  const colIndex: Partial<Record<keyof Omit<ImportRow, "rowNumber" | "errors">, number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key && colIndex[key] === undefined) colIndex[key] = i;
  });

  const rows: ImportRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every((c) => c === "" || c === null || c === undefined)) continue;
    const get = (k: keyof Omit<ImportRow, "rowNumber" | "errors">) =>
      colIndex[k] !== undefined ? r[colIndex[k]!] : "";
    const row: ImportRow = {
      rowNumber: i + 1,
      brand: str(get("brand")),
      client: str(get("client")),
      poNumber: str(get("poNumber")),
      poDate: toISODate(get("poDate")),
      deliveryDate: toISODate(get("deliveryDate")),
      articleCode: str(get("articleCode")),
      laceType: str(get("laceType")),
      materialType: str(get("materialType")),
      width: str(get("width")),
      length: str(get("length")),
      color: str(get("color")),
      uom: str(get("uom")) || "Mtr",
      quantity: (() => {
        const n = num(get("quantity"));
        return isNaN(n) ? 0 : n;
      })(),
      errors: [],
    };
    if (!row.client) row.errors.push("Missing Client");
    if (!row.poNumber) row.errors.push("Missing PO Number");
    if (!row.poDate) row.errors.push("Invalid/Missing PO Date");
    if (!row.deliveryDate) row.errors.push("Invalid/Missing Delivery Date");
    if (!row.uom) row.errors.push("Missing UOM");
    if (!row.quantity || row.quantity <= 0) row.errors.push("Invalid Actual Qty");
    rows.push(row);
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);
  const uniqueKey = (r: ImportRow) =>
    `${r.brand}||${r.client}||${r.poNumber}||${r.poDate}||${r.deliveryDate}`;
  const uniquePOs = new Set(validRows.map(uniqueKey)).size;
  const brands = Array.from(new Set(rows.map((r) => r.brand).filter(Boolean)));
  const clients = Array.from(new Set(rows.map((r) => r.client).filter(Boolean)));

  return { rows, validRows, invalidRows, uniquePOs, brands, clients };
}

export function downloadFailedRows(rows: ImportRow[], fileName = "failed_rows.xlsx") {
  const data = rows.map((r) => ({
    Row: r.rowNumber,
    Brand: r.brand,
    Client: r.client,
    "P.O Order": r.poNumber,
    "P.O Date": r.poDate,
    "Delivery date": r.deliveryDate,
    "Article Code": r.articleCode,
    "Lace Type": r.laceType,
    "Material Type": r.materialType,
    Width: r.width,
    Length: r.length,
    Color: r.color,
    UOM: r.uom,
    "Actual Qty": r.quantity,
    Errors: r.errors.join("; "),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Failed");
  XLSX.writeFile(wb, fileName);
}