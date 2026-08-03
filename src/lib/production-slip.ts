import type { PurchaseOrder } from "@/lib/store";
import { isItemFullyOverridden, itemOverriddenColors, type StoreShape as YarnStoreShape } from "@/lib/yarn-store";
import { poItemShades, poRawMaterialSummary } from "@/lib/production-store";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function printProductionSlip(opts: {
  po: PurchaseOrder;
  clientName: string;
  brandName: string;
  yarnState: YarnStoreShape;
}) {
  const { po, clientName, brandName, yarnState } = opts;
  const rawMats = poRawMaterialSummary(po, yarnState);

  const itemRows = po.items
    .map((it) => {
      const notRequiredColors = itemOverriddenColors(yarnState, it);
      const override = isItemFullyOverridden(yarnState, it);
      const shades = poItemShades(po, it, yarnState);
      const base =
        shades.find((s) => s.kind === "base" || s.kind === "single")
          ?.supplierShadeNumber || "—";
      const line = shades.find((s) => s.kind === "line")?.supplierShadeNumber || "—";
      return `
        <tr>
          <td class="mono">${esc(it.articleCode)}</td>
          <td>${esc(it.laceType)}</td>
          <td>${esc(it.materialType)}</td>
          <td>${esc(it.width)}</td>
          <td>${esc(it.length)}</td>
          <td>${esc(it.color)}</td>
          <td>${esc(it.uom)}</td>
          <td class="num">${esc(it.quantity)}</td>
          <td class="mono">${esc(base)}</td>
          <td class="mono">${esc(line)}</td>
          <td>${
            override
              ? "Yarn Not Required"
              : notRequiredColors.length
                ? `Yarn Not Required: ${esc(notRequiredColors.join(", "))}`
                : ""
          }</td>
        </tr>`;
    })
    .join("");

  const rmRows = rawMats.length
    ? rawMats
        .map(
          (m) => `
        <tr>
          <td>${esc(m.material)}</td>
          <td>${esc(m.colorName)}</td>
          <td class="mono">${esc(m.supplierShadeNumber || "—")}</td>
          <td>${m.received ? "Received" : "Pending"}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No raw materials required.</td></tr>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Production Slip — ${esc(po.poNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; }
  .sub { color: #555; font-size: 12px; margin-bottom: 12px; }
  .meta { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px 16px; font-size: 12px; border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
  .meta div span { display: block; color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta div b { font-weight: 600; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #888; text-align: center; }
  .foot { margin-top: 28px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; font-size: 11px; }
  .foot div { border-top: 1px solid #333; padding-top: 4px; text-align: center; color: #555; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
  .noprint { margin-bottom: 14px; }
  .noprint button { padding: 6px 12px; font-size: 12px; cursor: pointer; }
</style>
</head>
<body>
  <div class="noprint">
    <button onclick="window.print()">Print</button>
  </div>
  <h1>Production Slip</h1>
  <div class="sub">PO ${esc(po.poNumber)} · Generated ${new Date().toLocaleString()}</div>

  <div class="meta">
    <div><span>Client</span><b>${esc(clientName)}</b></div>
    <div><span>Brand</span><b>${esc(brandName)}</b></div>
    <div><span>PO Number</span><b>${esc(po.poNumber)}</b></div>
    <div><span>PO Date</span><b>${esc(po.poDate || "—")}</b></div>
    <div><span>Delivery Date</span><b>${esc(po.deliveryDate || "—")}</b></div>
    <div><span>Total Items</span><b>${po.items.length}</b></div>
    <div><span>Total Qty</span><b>${po.items.reduce((a, it) => a + Number(it.quantity || 0), 0)}</b></div>
    <div><span>Status</span><b>In Production</b></div>
  </div>

  <h2>Raw Material Summary</h2>
  <table>
    <thead><tr><th>Material</th><th>Color</th><th>Shade #</th><th>Status</th></tr></thead>
    <tbody>${rmRows}</tbody>
  </table>

  <h2>Production Items</h2>
  <table>
    <thead><tr>
      <th>Article</th><th>Lace Type</th><th>Material</th><th>Width</th><th>Length</th>
      <th>Color</th><th>UOM</th><th>Qty</th><th>Base Shade #</th><th>Line Shade #</th><th>Notes</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="foot">
    <div>Issued By</div>
    <div>Production In-Charge</div>
    <div>Store</div>
  </div>

  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=1024,height=768");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}