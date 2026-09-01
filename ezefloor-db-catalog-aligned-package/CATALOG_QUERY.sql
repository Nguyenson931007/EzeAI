DECLARE @customer_id nvarchar(100) = 'BUN-NSW-ACT';
DECLARE @task_key nvarchar(100) = 'insulation';

SELECT
    u.id,
    u.customer_id,
    u.task_key,
    u.usage_key,
    u.usage_type,
    u.section_key,
    u.group_key,
    u.subgroup_key,
    u.usage_label,
    u.display_name,
    u.item_number,
    u.description,
    u.unit,
    u.sort_order,
    u.parameters_json,
    d.item_description AS master_description,
    d.unit AS master_unit,
    d.parameters_json AS master_parameters_json
FROM [ProcurementApp].[dbo].[using_find_items] u
LEFT JOIN [ProcurementApp].[dbo].[data_find_items] d
  ON d.customer_id = u.customer_id
 AND d.item_number = u.item_number
WHERE u.customer_id = @customer_id
  AND u.task_key = @task_key
  AND u.is_active = 1
ORDER BY u.group_key, u.subgroup_key, u.sort_order, u.item_number;
