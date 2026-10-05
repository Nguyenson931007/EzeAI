## final_fit -- final fit-off hardware counts (SINGLE FORM -- return field_updates, NOT rows)

Counts derived from the door schedule -- not new products. In the app: passage_handles = number of INTERNAL doors; door_stops = number of ALL eligible doors.

- `final_fit_enabled`: "Yes" / "No".
- `entry_lock`: entry door lock product from supplied options.
- `passage_handles`: count of internal hinged doors (bedroom/bathroom/ensuite/laundry/WC -- exclude cavity sliders and dummy doors unless the schedule specifies them).
- `door_stops`: count of all hinged doors that need stops (internal + external hinged; exclude sliders/bifolds).
- Note: the backend independently derives actual quantities from the saved Lockup + Fixout rows -- these fields are the panel's configuration. Keep them consistent with the door schedule.
- Derive counts from the door schedule on the selected pages. Count carefully -- this is arithmetic, not estimation.
- If the door schedule is absent or incomplete ? UNRESOLVED, never invent counts.
