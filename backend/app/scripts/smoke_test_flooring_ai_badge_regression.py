from pathlib import Path

root = Path(__file__).resolve().parents[3]
path = root / 'frontend_next/src/components/bun-nsw-act/tasks/FlooringDeckingTask.jsx'
text = path.read_text(encoding='utf-8')

checks = [
    ('AI helper exists', 'const isFlooringAiRow = (row) =>' in text),
    ('direct room rows marked AI', 'source: "floor_ceiling_ai"' in text and 'roomIds: [r.id]' in text),
    ('grouped AI rows marked', 'id: `flr-auto-${lvl}-${aType}-${rIdx}`' in text and 'generatedByAI: true' in text),
    ('legacy cached AI rows inferred', 'id.startsWith("flr-auto-")' in text and 'row.roomId !== undefined' in text),
    ('TaskRowNumber uses inferred marker', 'row={isFlooringAiRow(item) ? { ...item, ai_generated: true, generatedByAI: true } : item}' in text),
    ('dropdown source-of-truth preserved', 'resolveDropdownValue(r.product, productOptions, { fallback: "" })' in text),
    ('manual DB rows remain manual', 'source: "manual"' in text and 'autofill_source: "manual"' in text),
]
failed = False
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    failed |= not ok
if failed:
    raise SystemExit(1)
print(f"\nFlooring AI badge regression smoke test: PASS ({len(checks)}/{len(checks)})")
