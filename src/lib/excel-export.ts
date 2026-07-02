import * as XLSX from "xlsx";
import type { PurchaseOrder, Invoice, Brand, Client } from "@/lib/store";

export function exportPOsToExcel(
  pos: PurchaseOrder[],
  brands: Brand[],
  clients: Client[],
  fileName = "purchase_orders.xlsx",
) {
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "";
  const data = pos.flatMap((p) =>
    (p.items.length ? p.items : [null]).map((i) => ({
      Brand: brandName(p.brandId),
      Client: clientName(p.clientId),
      "P.O Order": p.poNumber,
      "P.O Date": p.poDate,
      "Delivery date": p.deliveryDate,
      "Article Code": i?.articleCode ?? "",
      "Lace Type": i?.laceType ?? "",
      "Material Type": i?.materialType ?? "",
      Width: i?.width ?? "",
      Length: i?.length ?? "",
      Color: i?.color ?? "",
      UOM: i?.uom ?? "",
      "Actual Qty": i?.quantity ?? 0,
      Rate: i?.rate ?? 0,
    })),
  );
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Purchase Orders");
  XLSX.writeFile(wb, fileName);
}

export function exportInvoicesToExcel(
  invoices: Invoice[],
  clients: Client[],
  fileName = "invoices.xlsx",
) {
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "";
  const data = invoices.flatMap((inv) =>
    (inv.items.length ? inv.items : [null]).map((i) => ({
      "Dispatch Date": inv.dispatchDate,
      "Invoice No": inv.invoiceNumber,
      Client: clientName(inv.clientId),
      "PO Number": i?.poNumber ?? "",
      "Article Code": i?.articleCode ?? "",
      "Lace Type": i?.laceType ?? "",
      "Material Type": i?.materialType ?? "",
      Width: i?.width ?? "",
      Length: i?.length ?? "",
      Color: i?.color ?? "",
      UOM: i?.uom ?? "",
      "Dispatch Qty": i?.dispatchQty ?? 0,
      Rate: i?.rate ?? 0,
    })),
  );
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoices");
  XLSX.writeFile(wb, fileName);
}