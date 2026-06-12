import { createServerFn } from "@tanstack/react-start";

const MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

interface LearnedMapping {
  field: string;
  original_text: string;
  mapped_value: string;
  confirmations: number;
}

interface ExtractInput {
  fileBase64: string;
  fileName?: string;
  hints?: LearnedMapping[];
  clientHints?: LearnedMapping[];
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
- Decompose free-text descriptions into structured fields.
- Width/length are numeric strings WITHOUT units (e.g. "6" not "6MM").
- UOM must be one of: Mtr, Pcs, Pair, Kg, Roll. Default Mtr when unclear.
- Quantity and rate are pure numbers.
- If a value is missing, use empty string "" or 0 with confidence "low".
- Set confidence "high" only when the value is clearly readable in the PDF.
- Brand is the customer's brand name printed on the PO; client is the company that ISSUED the PO.
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

export const extractPoFromPdf = createServerFn({ method: "POST" })
  .inputValidator((input: ExtractInput) => {
    if (!input || typeof input.fileBase64 !== "string" || !input.fileBase64) {
      throw new Error("fileBase64 is required");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

    const sys = systemPrompt() + hintsBlock(data.hints ?? [], data.clientHints ?? []);

    const body = {
      systemInstruction: { parts: [{ text: sys }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract the Purchase Order data from this PDF and return strict JSON per the schema in the system prompt.",
            },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: data.fileBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
      },
    };

    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (upstream.status === 429) throw new Error("Rate limit exceeded. Try again shortly.");
    if (!upstream.ok) {
      const text = await upstream.text();
      throw new Error(`Gemini API error (${upstream.status}): ${text.slice(0, 500)}`);
    }

    const json = (await upstream.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    try {
      return { extraction: JSON.parse(raw) };
    } catch {
      throw new Error("AI returned non-JSON output");
    }
  });