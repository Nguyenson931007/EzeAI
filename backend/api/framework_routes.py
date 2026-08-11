"""
api/framework_routes.py – FrameWork API Router
================================================
Cung cấp REST endpoint để truy vấn bảng [emsflow].[dbo].[FrameWork]
JOIN với ListJobs để lấy danh sách Jobs kèm thông tin tường (Wall).

Hỗ trợ phân loại sàn: Timber Floor / Concrete Slab Floor.
Mỗi Job (IDJob_HW) có thể có tối đa 2 dòng FrameWork (1 Timber + 1 Slab).
Cột [The Wall Above] được dùng để lưu loại sàn: 'Timber' hoặc 'Slab'.

Tất cả các route đều có prefix /api/framework.
"""

import logging
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.mssql_db import get_mssql_connection

logger = logging.getLogger("ezefloor.framework")

router = APIRouter(prefix="/api/framework")


@router.get("/jobs")
async def get_framework_jobs(office: Optional[str] = Query(None, description="Filter by office code e.g. EZE0098")):
    """
    Truy vấn danh sách FrameWork jobs từ MSSQL [emsflow].
    JOIN với ListJobs để lấy JobNumber.
    Cột [The Wall Above] lưu loại sàn ('Timber' / 'Slab').
    """
    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                fw.ID AS framework_id,
                tghw.id AS IDJob_HW,
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,

                fw.[Wall Height] AS wall_height,
                fw.[Wall Length] AS wall_length,
                fw.[The Wall Above] AS wall_above,

                lj.JobNumber AS job_number

            FROM [emsflow].[dbo].[task_group_hw] tghw

            LEFT JOIN [emsflow].[dbo].[FrameWork] fw
                ON tghw.id = fw.IDJob_HW

            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0

            INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0

            WHERE
                ISNULL(tghw.is_delete, 0) = 0
                AND aj.MaNV = 'EZE0098'

            ORDER BY tghw.id DESC, fw.ID DESC;
        """

        cursor.execute(sql)
        rows = cursor.fetchall()

        # Chuyển đổi kiểu dữ liệu cho JSON serialization
        result = []
        for row in rows:
            item = {}
            for key, val in row.items():
                if val is None:
                    item[key] = None
                elif isinstance(val, (int, float, str, bool)):
                    item[key] = val
                else:
                    item[key] = str(val)
            result.append(item)

        return {
            "success": True,
            "total": len(result),
            "data": result
        }

    except Exception as e:
        logger.error(f"Lỗi truy vấn FrameWork jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.put("/save")
async def save_framework_wall(payload: dict):
    """
    Lưu/Cập nhật thông số bóc tách tường vào MSSQL [emsflow].[dbo].[FrameWork]
    
    Payload nhận vào:
    - framework_id: int | null (Nếu có -> UPDATE, nếu null -> INSERT dòng mới)
    - id_job_hw: int (Mã HW Job từ bảng task_group_hw)
    - wall_height: float (Chiều cao tường mm)
    - wall_length: float (Chiều dài tường mm)
    - floor_type: str ('Timber' hoặc 'Slab' - được lưu vào cột [The Wall Above])
    """
    conn = None
    try:
        framework_id = payload.get("framework_id")
        id_job_hw = payload.get("id_job_hw")
        wall_height = payload.get("wall_height")
        wall_length = payload.get("wall_length")
        floor_type = payload.get("floor_type")  # Lưu vào [The Wall Above]

        if not framework_id and not id_job_hw:
            raise HTTPException(status_code=400, detail="framework_id hoặc id_job_hw là bắt buộc")

        conn = get_mssql_connection()
        cursor = conn.cursor()

        if framework_id:
            # ── UPDATE dòng đã tồn tại trong FrameWork ──
            sql = """
                UPDATE [emsflow].[dbo].[FrameWork]
                SET IDJob_HW = %s,
                    [Wall Height] = %s,
                    [Wall Length] = %s,
                    [The Wall Above] = %s
                WHERE ID = %s
            """
            cursor.execute(sql, (id_job_hw, wall_height, wall_length, floor_type, framework_id))
            conn.commit()

            logger.info(
                f"Updated FrameWork ID={framework_id}: IDJob_HW={id_job_hw}, "
                f"Height={wall_height}, Length={wall_length}, FloorType(WallAbove)={floor_type}"
            )
            return {
                "success": True,
                "action": "update",
                "framework_id": framework_id,
                "message": f"Đã cập nhật FrameWork ID={framework_id} (IDJob_HW={id_job_hw}, Loại sàn: {floor_type})"
            }
        else:
            # ── INSERT dòng mới cho IDJob_HW ──
            sql = """
                INSERT INTO [emsflow].[dbo].[FrameWork]
                    (IDJob_HW, [Wall Height], [Wall Length], [The Wall Above])
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (id_job_hw, wall_height, wall_length, floor_type))
            conn.commit()

            logger.info(
                f"Inserted new FrameWork: IDJob_HW={id_job_hw}, "
                f"Height={wall_height}, Length={wall_length}, FloorType={floor_type}"
            )
            return {
                "success": True,
                "action": "insert",
                "message": f"Đã tạo dòng mới cho IDJob_HW={id_job_hw} (Height={wall_height}, Length={wall_length}, FloorType={floor_type})"
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Lỗi lưu FrameWork wall: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi lưu MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.get("/health")
async def framework_health_check():
    """Kiểm tra kết nối đến MSSQL [emsflow] có hoạt động không."""
    from app.mssql_db import test_mssql_connection
    ok = test_mssql_connection()
    if ok:
        return {"status": "ok", "message": "MSSQL emsflow connection successful"}
    else:
        raise HTTPException(status_code=503, detail="Cannot connect to MSSQL emsflow")
