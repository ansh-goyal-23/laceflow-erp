## Fix Yarn Order Editing

1. **Production Yarn Order edit page**
   - Remove the UI lock that disables the Color field when yarn has already been received.
   - Keep Material, Ordered Qty, Approved Shade, and Supplier Shade editable.
   - Keep the safety rule that Ordered Qty cannot be reduced below Received Qty.
   - Keep deletion disabled only for rows with receipts, because deleting those rows would orphan receipt history.
   - Replace the misleading “Received lines stay locked” message with a precise explanation of the deletion/quantity restriction.

2. **Sample Yarn Order edit page**
   - Remove the approved/received-based disabling from Client, Brand, Color, and Material fields.
   - Keep all remaining item fields editable.
   - Keep deletion disabled for approved or received rows to preserve approval and receipt links.
   - Update the page message so it no longer implies the entire row is locked.

3. **Save validation**
   - Confirm both full-update functions persist every editable item field.
   - Preserve existing integrity checks for received quantities and linked receipt/approval records.

4. **Verification**
   - Open existing Production and Sample Yarn Orders with linked receipts/approvals.
   - Edit item fields, save, reload, and confirm the new values persist while protected deletion and quantity constraints still work.