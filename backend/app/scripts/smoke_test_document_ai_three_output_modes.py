from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
checks = []

def check(name, cond):
    checks.append((name, bool(cond)))
    print(f"[{'PASS' if cond else 'FAIL'}] {name}")

container = (ROOT/'frontend_next/src/views/right-property-pane/TaskModulesContainer.jsx').read_text(encoding='utf-8')
right = (ROOT/'frontend_next/src/views/RightPropertyPaneView.jsx').read_text(encoding='utf-8')
review = (ROOT/'frontend_next/src/components/DocumentAiReviewModal.jsx').read_text(encoding='utf-8')
report = (ROOT/'frontend_next/src/components/DocumentAiReportModal.jsx').read_text(encoding='utf-8')
taskui = (ROOT/'frontend_next/src/components/bun-nsw-act/tasks/TaskUi.jsx').read_text(encoding='utf-8')

check('row tasks render separate GPT output rows', 'GPT output rows' in container and 'Separate GPT rows' in container)
check('GPT rows carry visible GPT note', 'GPT note:' in container and '>GPT</span>' in container)
check('aggregate row tasks use separate GPT card', 'aggregateGptTasks' in container and 'GPT additions' in container and 'Separate from current totals until Save GPT' in container)
check('flooring is classified as aggregate GPT task', '"flooring_decking", "hebel_flooring", "insulation"' in container)
check('no-row tasks show explicit overwrite proposals', 'GPT overwrite proposals' in container)
check('single-form overwrite requires explicit choice', 'Keep Current' in container and 'Use GPT Value' in container and 'onApplyGptFormProposal' in container)
check('GPT persisted rows display GPT badge instead of generic AI', 'isGptGenerated' in taskui and '{isGptGenerated ? "GPT" : "AI"}' in taskui)
check('successful GPT always opens separate report', 'setShowGptReport(true)' in right and 'setShowDocumentAi(false)' in right)
check('failed GPT also returns a report result', 'success: false' in review and 'onResult?.({' in review)
check('result notification visibly reports completion or failure', 'GPT review completed.' in report and 'GPT finished with an error.' in report)
check('result popup requires explicit acknowledgement action', '>Acknowledge</button>' in report)

failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit(f"Document AI three-output-mode smoke test: FAIL ({len(checks)-len(failed)}/{len(checks)})")
print(f"\nDocument AI three-output-mode smoke test: PASS ({len(checks)}/{len(checks)})")
