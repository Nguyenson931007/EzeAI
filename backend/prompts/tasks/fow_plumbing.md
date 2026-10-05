## fow_plumbing -- frame-over-wall plumbing items

Plumbing rough-in items installed in or over wall frames. In the app, rows are derived from ROOM COUNTS: each wet room type maps to a catalog product.

- Count rooms by type from the plan:
  - WC / toilet rooms ? toilet/WC product
  - Bathroom / ensuite / shower ? shower product
  - Kitchen ? kitchen/sink product
  - Laundry ? laundry tub product
- `qty`: number of matching rooms (e.g. 2 WCs ? qty 2 for the toilet item).
- `usage_label`: where/how the item is used (use supplied values).
- `code`: product code -- MUST match the supplied catalog options exactly (e.g. "0571980"). Never invent a code.
- `item_name`: product name matching the code.
- `note`: qualifier from the hydraulic plan (e.g. "Auto-filled from detected room labels").
- `floorLevel`: GF / FF.
- If a needed product has no exact catalog match ? UNRESOLVED with the room count and description, never substitute a different code.
- Evidence: floor plans (count SHR/WC/VB/BATH/ENS/KIT/L'DRY rooms), hydraulic / plumbing plan, plumbing schedule.
