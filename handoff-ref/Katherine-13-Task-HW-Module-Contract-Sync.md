# Katherine 13-Task HW Module Contract Sync

Implement the EZE0098 (Katherine team) 13-task standard module contract per the handoff reference at:

`C:\Users\LND01\Downloads\ezefloor-katherine-13-handoff-v1`

## Summary

Currently, `bun-nsw-act` is the only customer pack with a hardcoded `moduleIds` list (12 modules).

The handoff requires:

- **EZE0098 manager (Katherine) + non-Cairns customers** → 13-task standard set
- **EZE0098 + Cairns** → existing Cairns workflow unchanged
- **Other managers** → existing legacy behavior unchanged
- **Backend `task_modules`** → source of truth
- **Frontend** → never falls back to stale storage when the API explicitly returns `task_modules`

## Open Questions

### Q1: Hardies Fire Walls module

There is currently no `hardies_fire_walls` module tab in `EXTRA_MODULE_TABS`.

The handoff says:

- If a module exists, map step 13 to it
- If not, add the contract entry and leave the module mapping pending/empty

**Decision:** Do **not** create a fake placeholder module just to satisfy the mapping.

For now:

```js
13: null
```

Keep the contract entry:

```text
13. Hardies Fire Walls
```

Only map it to a real module ID once the real UI/component exists.

---

### Q2: Backend `task_group_hw_steps` query

The backend needs to query:

```sql
[emsflow].[dbo].[task_group_hw_steps]
```

to get `is_visible` per step.

**Decision:** Extend the existing endpoint:

```text
GET /jobs/open-by-ems/{ems_id}
```

Do not create a separate endpoint.

This keeps the job-open flow centralized:

```text
idJobEms
→ resolve job/customer/manager
→ resolve selected visible steps
→ map visible steps to EzeFloor modules
→ return one authoritative payload
```

## Proposed Changes

### Backend — `api/jobs.py`

#### Modify `jobs.py`

1. Add Katherine constants at module level.
2. Add helper functions:
   - `is_cairns()`
   - `get_expected_hw_steps()`
3. Extend `/jobs/open-by-ems/{ems_id}` to:
   - Query `task_group_hw_steps`
   - Read `is_visible`
   - Apply Katherine 13-task contract when `ma_nv == "EZE0098"` and customer is not Cairns
   - Keep Cairns on its existing separate workflow
   - Keep other managers on legacy behavior
   - Map visible steps → module IDs
   - Return:
     - `manager_code`
     - `selected_steps`
     - `task_modules`

### Frontend — `UIComponents.jsx`

#### Modify `UIComponents.jsx`

1. Add Katherine step-to-module mapping.
2. Add shared helper functions:
   - `isCairnsCustomer`
   - `isKatherineStandardJob`
3. Update `getInitialEnabledModules`:
   - If API returns `task_modules: []`, treat it as authoritative empty
   - Do not fall back to stale `localStorage` / `sessionStorage`
4. Add `"hardies_fire_walls"` to `MODULE_KEY_MAP` only when the real module actually exists.
   - Until then, keep step 13 mapping as `null`

### Frontend — `RightPropertyPaneView.jsx`

#### Modify `RightPropertyPaneView.jsx`

1. Update `handleOpenJobTask`:
   - Read `task_modules` from API response as authoritative
   - `task_modules: []` → show no standard modules
   - populated `task_modules` → show exactly those modules
2. Update `syncTaskContext`:
   - API `task_modules` overrides stale `localStorage`
   - API `task_modules` overrides stale `sessionStorage`

## Module ID Mapping

| Step | Task | Module ID |
| ---: | --- | --- |
| 1 | Cladding | `cladding` |
| 2 | Eaves Soffit | `eaves_soffit` |
| 3 | Flooring & Decking | `flooring_decking` |
| 4 | Frame Hardware | `frame_hardware` |
| 5 | Insulation | `insulation` |
| 6 | Lockup | `lock_up` |
| 7 | Fixout | `fixout` |
| 8 | Final Fit | `final_fit` |
| 9 | Shelving | `shelving` |
| 10 | Timber Post | `timber_posts` |
| 11 | FOW Plumbing | `fow_plumbing` |
| 12 | Power Truss Braces | `power_truss_braces` |
| 13 | Hardies Fire Walls | `null` / pending |

## Shared Frontend Helpers

```js
export const isCairnsCustomer = (customer) =>
  String(customer || "")
    .trim()
    .toUpperCase()
    .includes("CAIRNS");

export const isKatherineStandardJob = (managerCode, customer) =>
  String(managerCode || "").trim().toUpperCase() === "EZE0098" &&
  !isCairnsCustomer(customer);
```

## Katherine Step-to-Module Mapping

```js
export const KATHERINE_STEP_TO_MODULE = {
  1: "cladding",
  2: "eaves_soffit",
  3: "flooring_decking",
  4: "frame_hardware",
  5: "insulation",
  6: "lock_up",
  7: "fixout",
  8: "final_fit",
  9: "shelving",
  10: "timber_posts",
  11: "fow_plumbing",
  12: "power_truss_braces",
  13: null, // Hardies Fire Walls — no module yet
};
```

## Backend Contract

```python
KATHERINE_STANDARD_STEPS = {
    1: "Cladding",
    2: "Eaves Soffit",
    3: "Flooring & Decking",
    4: "Frame Hardware",
    5: "Insulation",
    6: "Lockup",
    7: "Fixout",
    8: "Final Fit",
    9: "Shelving",
    10: "Timber Post",
    11: "FOW Plumbing",
    12: "Power Truss Braces",
    13: "Hardies Fire Walls",
}
```

## Authoritative Task Selection Rule

The available task contract and the selected task list are separate concerns.

For Katherine non-Cairns jobs:

```text
available contract = 13 tasks
selected modules = only steps where task_group_hw_steps.is_visible = 1
```

Therefore:

- Do not auto-enable all 13 modules
- Do not infer selected modules from the available contract
- Do not restore stale modules from browser storage
- `task_modules=[]` is a valid authoritative result

## Verification Plan

### Automated

Backend:

```bash
curl http://localhost:3011/jobs/open-by-ems/{ems_id}
```

Verify response includes:

```json
{
  "manager_code": "EZE0098",
  "selected_steps": [],
  "task_modules": []
}
```

Frontend:

Verify:

- `isKatherineStandardJob("EZE0098", "BUN-NSW-ACT") === true`
- `isKatherineStandardJob("EZE0098", "CAIRNS") === false`
- other manager codes remain false

### Manual

#### Test A

Open an EZE0098 + BUN NSW job.

Expected:

- 13-task contract
- visible modules follow only selected steps

#### Test B

Open an EZE0098 + another non-Cairns customer.

Expected:

- same 13-task contract
- same selection behavior

#### Test C

Open EZE0098 + Cairns.

Expected:

- existing Cairns workflow unchanged

#### Test D

Open jobs for other manager codes.

Expected:

- old legacy behavior unchanged

#### Test E

API returns:

```json
{
  "task_modules": []
}
```

Expected:

- no standard modules shown
- no stale fallback from `localStorage`
- no stale fallback from `sessionStorage`

## Final Contract

```text
EZE0098 / Katherine
├─ Cairns
│  └─ existing Cairns workflow
└─ all other customers
   └─ common 13-task contract

Other managers
└─ legacy behavior unchanged
```

The EzeFloor implementation should use the smallest clean diff, reuse existing helpers, and avoid duplicating customer-specific task arrays across multiple frontend files.
