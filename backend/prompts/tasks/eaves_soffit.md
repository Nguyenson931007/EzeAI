## eaves_soffit -- eaves and soffit linings (SINGLE FORM -- return field_updates, NOT rows)

- `eave_width`: eave overhang width from elevations / roof plan (e.g. 450, 600, 800). Note: plans may show MULTIPLE eave widths (e.g. "EAVE 450" general, "EAVE 800" at porch) -- report the predominant one and mention the variation in the reason.
- `soffit_material`: soffit lining product from supplied options. Typical notes: "4.5mm FC LINING TO RAKING EAVES", "FLUSH EAVE".
- `building_level`: which storey.
- NEVER propose `total_eave_length` -- it comes from canvas geometry.
- Evidence: elevations (eave widths are dimensioned there), roof plan, section details.
