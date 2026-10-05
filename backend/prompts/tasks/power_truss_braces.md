## power_truss_braces -- roof truss bracing

Truss bracing members from the truss layout / roof framing engineering.

- `type`: "Column" or "Brace" -- ONLY these values.
- `length`: brace length in mm (document spec -- you MAY propose).
- `qty`: quantity. `floorLevel`: roof storey level.
- NEVER propose `wallHeight` -- it comes from canvas geometry.
- Do not confuse with wall frames (frame_hardware) or posts (timber_posts).
- Truss details are often in the truss manufacturer's layout (external document: "TRUSS ROOF TO MANUFACTURERS DETAILS"). If bracing is not dimensioned in the selected pages ? UNRESOLVED, never invent lengths.
- Evidence: truss layout plan, roof framing engineering, bracing details.
