Plan: Remove redundant Approve/Redye actions from the Sample Order detail view

Background
- The Sample Order detail page (`src/routes/_authenticated/yarn.sample-orders.$id.index.tsx`) shows an Actions column with Approve/Redye buttons for every pending item.
- The same two actions already exist in the dedicated Approvals Needed queue on the Sample Orders list page (`src/routes/_authenticated/yarn.sample-orders.index.tsx`), which is the intended single approval/rejection path.
- Both places call `yarnStore.approveSampleItem` and `yarnStore.redyeSampleItem`.

Changes
1. Detail view cleanup
   - Remove the Actions column for item rows in the detail view.
   - Remove the Approve and Redye buttons.
   - Remove the local state used only for the detail-view approval dialog (`approveFor`, `shadeNo`, `doApprove`, `setApproveFor`).
   - Remove the Approve Sample Dialog from the detail view.
   - Remove the direct handler that calls `yarnStore.redyeSampleItem` from the detail view.
2. Preserve read-only status
   - Keep the Approval Status badge column (pending / approved / redye) so the detail view still shows the outcome.
   - Keep the Receipts table unchanged.
3. Keep the dedicated queue intact
   - Leave the Approvals Needed tab, its approval/redye buttons, and its Approve dialog in the list page as-is.
   - Leave the `yarnStore` functions unchanged.

Verification
- Open a Sample Order with a pending item; confirm there are no Approve/Redye buttons on the detail page.
- Confirm the Approval Status badge still renders correctly.
- Confirm the Approvals Needed tab still shows the same item and can approve/redye it successfully.