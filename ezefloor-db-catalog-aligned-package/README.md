# EzeFloor ↔ Procurement catalog alignment

Mục tiêu: EzeFloor dùng cùng catalog DB với Procurement để dropdown/save luôn match nhau.

## Source of truth
- `[ProcurementApp].[dbo].[data_find_items]`: master item.
- `[ProcurementApp].[dbo].[using_find_items]`: item đang dùng theo `customer_id + task_key + group`.

Runtime không hard-code product code/description trong BE hoặc JSX.

## Cách tích hợp
1. Copy `catalog_repository.py` vào BE hiện tại, dùng DB session sẵn có.
2. Expose endpoint tương đương `GET /api/catalog?customer_id=...&task_key=...`.
3. FE gọi catalog theo customer/task hiện tại.
4. Dropdown lưu `itemNumber` hoặc canonical value từ item đã chọn; không cho nhập Product tự do.
5. Khi save task table, dùng đúng item được chọn từ catalog.

## Dedupe
Repository dedupe các row hoàn toàn giống nhau theo:
`group_key + subgroup_key + item_number + canonical description`.
Không chọn đại khi 2 row khác product nhưng cùng label.

## EavesSoffitTask.jsx hiện tại cần bỏ
- Hard-coded brand/thickness/batten/bead arrays.
- Default/fallback product text cứng.
- Fallback job `TestAI`.
- Hard-coded `short_name` nếu component có thể dùng customer khác.

File `EavesSoffitTask.DB_DRIVEN_GUIDE.jsx` là guide tích hợp catalog DB vào component hiện tại.

**Lưu ý:** schema/query hiện có chứng minh product catalog qua `using_find_items + data_find_items`. Brand/Thickness chỉ nên chuyển sang DB khi DB đã có usage/group tương ứng; package không tự bịa group/key cho hai field này.

## Không bao gồm
- Formula/calculator.
- `formula_key`, `condition_key`, `output_key` trong response API cho FE.
- Add AI logic của Procurement.
- Credentials/connection string.
