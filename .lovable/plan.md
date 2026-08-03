## Goal

In "Create Production Yarn Order", the Add PO picker only lists POs whose computed procurement stage is `waiting_for_yarn_order` or `in_sampling` (`yarn.production-orders.new.tsx:63-75`). Other open POs are hidden.

## Change

Show every open PO in the picker.

- Keep the `status === "open"` filter; drop the stage filter so all open POs are listed.
- Keep the stage badge in the row so the user can see each PO's procurement stage.
- Sorting: POs at stage `waiting_for_yarn_order` or `in_sampling` stay on top in the current delivery-urgency order; the rest follow, sorted by delivery date.
- Add a "Only POs awaiting yarn order" checkbox (default OFF) to re-apply the old filter when wanted.
- Search keeps working across PO number, client, PO date and delivery date.

## Notes

No store or database change needed — selecting any open PO expands its items into colour lines the same way.
