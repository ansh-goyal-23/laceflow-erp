## Goal

In "Create Production Yarn Order", the Add PO picker currently hides most POs. It only lists POs where `status === "open"` AND the computed procurement stage is `waiting_for_yarn_order` or `in_sampling` (`yarn.production-orders.new.tsx:63-75`). Completed POs, and open POs already past those stages, never appear.

## Change

Make the picker show every PO, with the recommended ones surfaced first.

- Remove the `status === "open"` and stage filters from the list source; build rows from all POs.
- Add a "Status" column showing Open / Completed, plus keep the existing stage badge so the user can see why a PO was previously hidden.
- Sorting: eligible POs (stage `waiting_for_yarn_order` or `in_sampling`, status open) stay at the top in the current delivery-urgency order; all remaining POs follow, sorted by delivery date.
- Add a "Show only POs awaiting yarn order" checkbox in the picker, default ON, so the current focused view is one click away while the full list is available by unchecking it.
- Search continues to work across PO number, client, PO date and delivery date over whatever list is displayed.

## Notes

Selecting a completed PO works with existing logic — its items expand into colour lines the same way; no store or database change is needed.
