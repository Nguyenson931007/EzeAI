# Unified opaque sticky task table patch

- Centralizes frozen identity-column behavior in `TaskTableEnhancer`.
- Sticky cells are always opaque, so the plan/canvas cannot show through.
- Freezes one contiguous identity block from `#` through `Label`:
  - Fixout: `# + Label`
  - Lockup: `# + Category + Location + Label`
- Removes Lockup's one-off manual sticky positioning/border/shadow that caused the odd vertical divider/overlap.
- Uses one clean divider only after the final frozen identity column.
- Keeps existing double-click edit / task routing logic unchanged.
