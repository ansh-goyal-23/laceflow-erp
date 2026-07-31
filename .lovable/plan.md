## Problem

`expandPoColors` in `src/lib/yarn-store.ts` (line 1029) is the single place that splits a PO color into separate procurement colors. Its regex is:

```
/^(.*?)\s*\/\s*LINE\s+(.+)$/i
```

It requires whitespace after `LINE`, so the real-world PO formats fail:

- `"BASE-ARUBA BLUE/LINE-PEACOCK BLUE"` — no match (hyphen after LINE) → treated as ONE color, and the `BASE-` prefix stays in the name.
- `"BASE-WHITE/LINE-CENDRE BLUE"` — same failure.
- `"LEMONADE/LINE-BLACK"` — same failure.

Result: these lace items are ordered as a single compound color instead of two separate yarn colors.

## Fix

Rewrite `expandPoColors` to:

1. Split on `/` when the right-hand side starts with the `LINE` marker, accepting any of `LINE-`, `LINE :`, `LINE_`, or `LINE ` (regex separator class `[\s\-:_]+`).
2. Strip a leading `BASE` marker (`BASE-`, `BASE:`, `BASE `) from the left-hand side, so `"BASE-ARUBA BLUE"` becomes `"ARUBA BLUE"`.
3. Collapse repeated whitespace and trim each resulting name.
4. Keep the existing return shape `{ name, kind: "base" | "line" | "single" }` and the existing fallback (no marker → single entry with the original string).

Examples after the fix:

```text
"BASE-ARUBA BLUE/LINE-PEACOCK BLUE"  -> ARUBA BLUE (base), PEACOCK BLUE (line)
"BASE-WHITE/LINE-CENDRE BLUE"        -> WHITE (base), CENDRE BLUE (line)
"LEMONADE/LINE-BLACK"                -> LEMONADE (base), BLACK (line)
"LIMPET SHELL / LINE VIBRANT ORANGE" -> LIMPET SHELL (base), VIBRANT ORANGE (line)  (still works)
"NAVY BLUE"                          -> NAVY BLUE (single)
```

## Scope

Only `expandPoColors` changes. Every consumer already calls it — production yarn order creation, procurement stage calculation (`calculateProcurementStage`, `poItemStage`, `poOverallStage`), the pendency reports, and the production slip — so all of them pick up the corrected split automatically. No schema or data migration; existing production-order rows already saved with the compound name are untouched (they can be edited/deleted manually if needed).

## Out of scope

- Backfilling/rewriting already-created production yarn order lines that used the old compound color.
- Any other separator conventions not seen in the POs above (can be added later if new formats appear).
