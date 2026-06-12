import { createFileRoute } from "@tanstack/react-router";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

interface LearnedMapping {
  field: string;
  original_text: string;
  mapped_value: string;
  confirmations: number;
}

function systemPrompt(): string {
  return `You are an expert at extracting Purchase Order data from PDF documents used by Indian textile/lace manufacturers.
You must read the entire PDF (including scanned pages via OCR) and return ONE strict JSON object.

Return ONLY JSON matching this exact shape (no markdown, no commentary):
{
  "header": {
    "brandGuess":   { "value": string|null, "confidence": "high"|"medium"|"low" },
    "clientGuess":  { "value": string|null, "confidence": "high"|"medium"|"low",
                      "address": string|null, "gstin": string|null, "phone": string|null, "email": string|null },
    "poNumber":     { "value": string|null, "confidence": "high"|"medium"|"low" },
    "poDate":       { "value": string|null, "confidence": "high"|"medium"|"low" },
    "deliveryDate": { "value": string|null, "confidence": "high"|"medium"|"low" }
  },
  "items": [
    {
      "rawDescription": string,
      "articleCode":  { "value": string,        "confidence": "high"|"medium"|"low" },
      "laceType":     { "value": string,        "confidence": "high"|"medium"|"low" },
      "materialType": { "value": string,        "confidence": "high"|"medium"|"low" },
      "width":        { "value": string,        "confidence": "high"|"medium"|"low" },
      "length":       { "value": string,        "confidence": "high"|"medium"|"low" },
      "color":        { "value": string,        "confidence": "high"|"medium"|"low" },
      "uom":          { "value": "Mtr"|"Pcs"|"Pair"|"Kg"|"Roll", "confidence": "high"|"medium"|"low" },
      "quantity":     { "value": number,        "confidence": "high"|"medium"|"low" },
      "rate":         { "value": number,        "confidence": "high"|"medium"|"low" }
    }
  ]
}

Rules:
- Dates MUST be ISO format YYYY-MM-DD. Parse Indian formats (DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY).
- Decompose free-text descriptions into structured fields. Examples:
    "6MM OVAL LACE WITH HIGH BULK YARN 105 CM DIGI-BLUE"
      -> width=6, laceType=OVAL LACE, materialType=HIGH BULK YARN, length=105, color=DIGI-BLUE
    "10MM WEBBING HIGH BULK YARN"
      -> width=10, laceType=WEBBING, materialType=HIGH BULK YARN
- Width/length are numeric strings WITHOUT units (e.g. "6" not "6MM").
- UOM must be one of: Mtr, Pcs, Pair, Kg, Roll. Default Mtr when unclear.
- Quantity and rate are pure numbers.
- If a value is missing, use empty string "" or 0 with confidence "low".
- Set confidence "high" only when the value is clearly readable in the PDF.
- Brand is the customer's brand name printed on the PO (Nike, Mochiko, KNS, etc.); client is the company that ISSUED the PO.
- Do NOT invent data. Prefer "low" + empty over guessing.`;
}

function hintsBlock(hints: LearnedMapping[], clientHints: LearnedMapping[]): string {
  if (hints.length === 0 && clientHints.length === 0) return "";
  const fmt = (m: LearnedMapping) =>
    `  - field=${m.field}  "${m.original_text}" -> "${m.mapped_value}" (confirmed ${m.confirmations}x)`;
  return [
    "\n\nLEARNED MAPPINGS (apply these when descriptions match):",
    clientHints.length ? "Client-specific:\n" + clientHints.map(fmt).join("\n") : "",
    hints.length ? "Global:\n" + hints.map(fmt).join("\n") : "",
    "When you apply a learned mapping, raise that field's confidence to 'high'.",
  ]
    .filter(Boolean)
    .join("\n");
}

export const Route = createFileRoute("/api/extract-po-pdf")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ error: "LOVABLE_API_KEY is not configured" }, { status: 500 });
        }

        let payload: {
          fileBase64?: string;
          fileName?: string;
          hints?: LearnedMapping[];
          clientHints?: LearnedMapping[];
        };
        try {
          payload = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (!payload.fileBase64) {
          return Response.json({ error: "fileBase64 is required" }, { status: 400 });
        }

        const fileName = payload.fileName || "purchase-order.pdf";
        const dataUrl = `data:application/pdf;base64,${payload.fileBase64}`;
        const sys = systemPrompt() + hintsBlock(payload.hints ?? [], payload.clientHints ?? []);

        const body = {
          model: MODEL,
          messages: [
            { role: "system", content: sys },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract the Purchase Order data from this PDF and return strict JSON per the schema in the system prompt.",
                },
                {
                  type: "file",
                  file: { filename: fileName, file_data: dataUrl },
                },
              ],
            },
          ],
          response_format: { type: "json_object" },
        };

        let upstream: Response;
        try {
          upstream = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "X-Lovable-AIG-SDK": "raw-fetch",
            },
            body: JSON.stringify(body),
          });
        } catch (err) {
          return Response.json(
            { error: `Gateway request failed: ${(err as Error).message}` },
            { status: 502 },
          );
        }

        if (upstream.status === 429) {
          return Response.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
        }
        if (upstream.status === 402) {
          return Response.json(
            { error: "AI credits exhausted. Please add credits in workspace settings." },
            { status: 402 },
          );
        }
        if (!upstream.ok) {
          const text = await upstream.text();
          return Response.json(
            { error: `AI gateway error (${upstream.status}): ${text.slice(0, 500)}` },
            { status: 502 },
          );
        }

        const data = (await upstream.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = data.choices?.[0]?.message?.content ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return Response.json(
            { error: "AI returned non-JSON output", raw: raw.slice(0, 1000) },
            { status: 502 },
          );
        }

        return Response.json({ extraction: parsed });
      },
    },
  },
});