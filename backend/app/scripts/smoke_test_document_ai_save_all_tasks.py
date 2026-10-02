from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FE = ROOT / "frontend_next" / "src"

checks = []
def check(name, ok):
    checks.append((name, bool(ok)))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")

entered = (FE / "components/bun-nsw-act/tasks/EnteredTaskActions.jsx").read_text(encoding="utf-8")
right = (FE / "views/RightPropertyPaneView.jsx").read_text(encoding="utf-8")

check("shared GPT save event is listened by normal task action bar", 'ezefloor:gpt-save-task' in entered)
check("normal visible Save callback is reused", 'await onSaveRef.current()' in entered)
check("GPT rows request save only after commit", 'requestMountedTaskSave(taskKey);' in right)
check("save is deferred beyond React state commit", 'requestAnimationFrame' in right)
check("single-form GPT value saves only after explicit Use GPT", 'if (useGptValue && taskKey !== "final_fit") requestMountedTaskSave(taskKey);' in right)
check("Final Fit is not falsely persisted to a non-existent table", 'taskKey !== "final_fit"' in right)

contracts = {
    "frame_hardware": ("FrameHardwareTask.jsx", "saveFrameworkJobs"),
    "flooring_decking": ("FlooringDeckingTask.jsx", "saveAreaSummaryJobs"),
    "hebel_flooring": ("HebelFlooringTask.jsx", "saveAreaSummaryJobs"),
    "insulation": ("InsulationTask.jsx", "saveInsulationJobs"),
    "eaves_soffit": ("EavesSoffitTask.jsx", "saveEavesJobs"),
    "cladding": ("CladdingTask.jsx", "saveCladdingJobs"),
    "lock_up": ("LockupTask.jsx", "saveLockoutJobs"),
    "fixout": ("FixoutTask.jsx", "saveFixoutJobs"),
    "windows": ("WindowTask.jsx", "saveFixoutJobs"),
    "shelving": ("ShelvingTask.jsx", "saveShelvingJobs"),
    "timber_posts": ("TimberPostsTask.jsx", "saveTimberPostsJobs"),
    "power_truss_braces": ("PowerTrussBracesTask.jsx", "savePowerTrussJobs"),
    "fow_plumbing": ("FowPlumbingTask.jsx", "saveFowPlumbingJobs"),
    "hardies_fire_walls": ("HardiesFireWallsTask.jsx", "saveCladdingJobs"),
}
for task_key, (filename, api_name) in contracts.items():
    text = (FE / "components/bun-nsw-act/tasks" / filename).read_text(encoding="utf-8")
    check(f"{task_key} keeps existing DB save contract ({api_name})", api_name in text)

failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit(f"Document AI Save GPT coverage smoke test: FAIL ({len(checks)-len(failed)}/{len(checks)})")
print(f"Document AI Save GPT coverage smoke test: PASS ({len(checks)}/{len(checks)})")
