"""
backend/api/jobs.py
===================
Module xá»­ lÃ½ quáº£n lÃ½ dá»± Ã¡n (Jobs) cá»§a EzeFloor.
Bao gá»“m cÃ¡c chá»©c nÄƒng: LÆ°u dá»± Ã¡n, Äá»c danh sÃ¡ch dá»± Ã¡n cá»§a ngÆ°á»i dÃ¹ng, Äá»c dá»¯ liá»‡u chi tiáº¿t,
KhÃ´i phá»¥c, Äá»•i tÃªn, XÃ³a dá»± Ã¡n, TrÃ­ch xuáº¥t & thu nhá» áº£nh thu nhá» (Thumbnail Base64) Ä‘á»ƒ tá»‘i Æ°u dung lÆ°á»£ng DB,
Xem lá»‹ch sá»­ chá»‰nh sá»­a chÃ©o, vÃ  Chia sáº» dá»± Ã¡n cÃ´ng khai qua Token báº£o máº­t.
"""

from fastapi import APIRouter, HTTPException, Depends, Response, Header, Query
import secrets
import logging
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_db_connection
from api.auth import validate_session
import json

logger = logging.getLogger("ezefloor.jobs")

# Khá»Ÿi táº¡o APIRouter cho cÃ¡c API liÃªn quan Ä‘áº¿n quáº£n lÃ½ dá»± Ã¡n
router = APIRouter()

# â”€â”€ Pydantic Schemas (MÃ´ hÃ¬nh dá»¯ liá»‡u Ä‘áº§u vÃ o vÃ  Ä‘áº§u ra) â”€â”€

class JobCreate(BaseModel):
    """MÃ´ hÃ¬nh dá»¯ liá»‡u gá»­i lÃªn khi táº¡o má»›i hoáº·c cáº­p nháº­t má»™t dá»± Ã¡n."""
    username: str
    project_name: str
    room_count: Optional[int] = 0
    total_area: Optional[float] = 0.0
    data: str  # Chuá»—i JSON chá»©a toÃ n bá»™ tráº¡ng thÃ¡i váº½ (phÃ²ng, tÆ°á»ng, cá»­a, tá»· lá»‡ váº½)


class JobResponse(BaseModel):
    """MÃ´ hÃ¬nh pháº£n há»“i thÃ´ng tin tÃ³m táº¯t dá»± Ã¡n cá»§a má»™t ngÆ°á»i dÃ¹ng cá»¥ thá»ƒ."""
    id: int
    project_name: str
    room_count: Optional[int] = 0
    total_area: Optional[float] = 0.0
    created_at: str
    thumbnail: Optional[str] = None
    is_trained: Optional[int] = 0
    is_corrected: Optional[int] = 0
    share_token: Optional[str] = None


class JobAllResponse(BaseModel):
    """MÃ´ hÃ¬nh pháº£n há»“i thÃ´ng tin tÃ³m táº¯t dá»± Ã¡n dÃ nh cho mÃ n hÃ¬nh giÃ¡m sÃ¡t toÃ n há»‡ thá»‘ng (Admin)."""
    id: int
    project_name: str
    room_count: Optional[int] = 0
    total_area: Optional[float] = 0.0
    created_at: str
    username: str
    thumbnail: Optional[str] = None
    is_trained: Optional[int] = 0
    is_corrected: Optional[int] = 0
    share_token: Optional[str] = None


# â”€â”€ Helper Functions (HÃ m bá»• trá»£ xá»­ lÃ½ áº£nh vÃ  trÃ­ch xuáº¥t dá»¯ liá»‡u) â”€â”€

def resize_image(b64_str: str, size=(200, 200)) -> str:
    """
    Thu nhá» kÃ­ch thÆ°á»›c hÃ¬nh áº£nh dÆ°á»›i dáº¡ng chuá»—i Base64.
    Má»¥c Ä‘Ã­ch: Chuyá»ƒn Ä‘á»•i báº£n váº½ dung lÆ°á»£ng lá»›n thÃ nh áº£nh thumbnail siÃªu nháº¹ Ä‘á»ƒ lÆ°u vÃ o database
    mÃ  khÃ´ng lÃ m ngháº½n hiá»‡u nÄƒng truy váº¥n DB. Sá»­ dá»¥ng nÃ©n JPEG cháº¥t lÆ°á»£ng 70%.
    """
    if not b64_str or "," not in b64_str:
        return b64_str
    
    try:
        import base64
        import io
        from PIL import Image
        
        # TÃ¡ch pháº§n header Ä‘á»‹nh dáº¡ng dá»¯ liá»‡u ra khá»i chuá»—i Base64 mÃ£ hÃ³a
        header, encoded = b64_str.split(",", 1)
        image_data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(image_data))
        
        # Thá»±c hiá»‡n thu nhá» áº£nh giá»¯ nguyÃªn tá»· lá»‡ khung hÃ¬nh (Aspect Ratio) sá»­ dá»¥ng thuáº­t toÃ¡n nÃ©n LANCZOS cháº¥t lÆ°á»£ng cao
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=70)  # NÃ©n Ä‘á»‹nh dáº¡ng JPEG cháº¥t lÆ°á»£ng 70 Ä‘á»ƒ Ä‘áº¡t dung lÆ°á»£ng tá»‘i Æ°u
        new_encoded = base64.b64encode(buffered.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{new_encoded}"
    except Exception as e:
        print(f"Lá»—i khi nÃ©n áº£nh thumbnail: {e}")
        return b64_str


def _extract_thumbnail(data_str: str) -> Optional[str]:
    """
    TrÃ­ch xuáº¥t áº£nh ná»n tá»« trang Ä‘áº§u tiÃªn (Page 0) cá»§a dá»± Ã¡n Ä‘á»ƒ táº¡o áº£nh thumbnail.
    """
    try:
        job_data = json.loads(data_str)
        pages = job_data.get("pages", [])
        if pages and len(pages) > 0:
            raw_img = pages[0].get("image")
            if raw_img:
                return resize_image(raw_img)
    except Exception:
        pass
    return None


# â”€â”€ API Endpoints (CÃ¡c Ä‘á»‹nh tuyáº¿n giao tiáº¿p dá»± Ã¡n) â”€â”€

@router.post("/jobs")
def create_job(job: JobCreate, username: str = Depends(validate_session)):
    """
    LÆ°u dá»± Ã¡n váº½ sÃ n (Táº¡o má»›i hoáº·c Cáº­p nháº­t ghi Ä‘Ã¨ báº£n cÅ©).
    - Há»— trá»£ Ä‘á»•i chá»§ sá»Ÿ há»¯u dá»± Ã¡n (Ownership) náº¿u má»™t ngÆ°á»i dÃ¹ng khÃ¡c lÆ°u Ä‘Ã¨ lÃªn tÃªn dá»± Ã¡n cÅ©.
    - LÆ°u váº¿t lá»‹ch sá»­ chá»‰nh sá»­a chÃ©o vÃ o báº£ng `job_history`.
    - TrÃ­ch xuáº¥t tá»± Ä‘á»™ng vÃ  nÃ©n áº£nh Ä‘áº¡i diá»‡n (Thumbnail) Ä‘á»ƒ tá»‘i Æ°u lÆ°u trá»¯.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Chuáº©n hÃ³a tÃªn dá»± Ã¡n (bá» khoáº£ng tráº¯ng thá»«a á»Ÿ hai Ä‘áº§u)
        job.project_name = job.project_name.strip()

        # TÃ¬m ID cá»§a ngÆ°á»i dÃ¹ng thá»±c hiá»‡n yÃªu cáº§u dá»±a trÃªn username Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c thá»±c
        cursor.execute("SELECT id FROM users WHERE username = ?", (job.username,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y thÃ´ng tin ngÆ°á»i dÃ¹ng trong há»‡ thá»‘ng.")
        
        user_id = user_row["id"]
        
        # Tá»± Ä‘á»™ng trÃ­ch xuáº¥t vÃ  nÃ©n hÃ¬nh áº£nh trang Ä‘áº§u lÃ m thumbnail
        thumbnail = _extract_thumbnail(job.data)
        
        # Kiá»ƒm tra xem tÃªn dá»± Ã¡n Ä‘Ã£ tá»“n táº¡i hay chÆ°a (khÃ´ng phÃ¢n biá»‡t hoa thÆ°á»ng)
        cursor.execute(
            "SELECT id, user_id FROM jobs WHERE LOWER(project_name) = LOWER(?)", 
            (job.project_name,)
        )
        existing_job = cursor.fetchone()
        
        if existing_job:
            old_user_id = existing_job["user_id"]
            
            # Ghi nháº­n lá»‹ch sá»­ bÃ n giao/ghi Ä‘Ã¨ náº¿u ngÆ°á»i lÆ°u hiá»‡n táº¡i khÃ¡c vá»›i ngÆ°á»i táº¡o ban Ä‘áº§u
            if old_user_id != user_id:
                cursor.execute(
                    "INSERT INTO job_history (job_id, project_name, old_user_id, new_user_id) VALUES (?, ?, ?, ?)",
                    (existing_job["id"], job.project_name, old_user_id, user_id)
                )

            # Thá»±c hiá»‡n cáº­p nháº­t ghi Ä‘Ã¨ ná»™i dung báº£n váº½, tá»•ng diá»‡n tÃ­ch, thumbnail vÃ  chuyá»ƒn quyá»n sá»Ÿ há»¯u
            cursor.execute(
                """UPDATE jobs SET user_id = ?, project_name = ?, room_count = ?, 
                   total_area = ?, data = ?, thumbnail = ?, is_corrected = 1, 
                   created_at = CURRENT_TIMESTAMP 
                   WHERE id = ?""",
                (user_id, job.project_name, job.room_count, job.total_area, job.data, thumbnail, existing_job["id"])
            )
            conn.commit()
            
            try:
                from services.search.vector_search_engine import clear_project_index_cache
                clear_project_index_cache(existing_job["id"])
            except Exception:
                pass
                
            return {"status": "updated", "job_id": existing_job["id"]}
        else:
            # Táº¡o má»›i hoÃ n toÃ n má»™t báº£n váº½ dá»± Ã¡n
            cursor.execute(
                "INSERT INTO jobs (user_id, project_name, room_count, total_area, data, thumbnail) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, job.project_name, job.room_count, job.total_area, job.data, thumbnail)
            )
            conn.commit()
            return {"status": "success", "job_id": cursor.lastrowid}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/count")
def get_jobs_count(username: Optional[str] = None):
    """
    Láº¥y sá»‘ lÆ°á»£ng tá»•ng sá»‘ dá»± Ã¡n Ä‘Ã£ lÆ°u trong há»‡ thá»‘ng.
    - Náº¿u cung cáº¥p `username`: Äáº¿m sá»‘ lÆ°á»£ng dá»± Ã¡n thuá»™c sá»Ÿ há»¯u cá»§a ngÆ°á»i dÃ¹ng Ä‘Ã³.
    - Náº¿u khÃ´ng: Tráº£ vá» sá»‘ lÆ°á»£ng toÃ n bá»™ dá»± Ã¡n trÃªn há»‡ thá»‘ng.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            if username and username.strip() not in ("undefined", "null", "None", ""):
                cursor.execute(
                    "SELECT COUNT(*) as total FROM jobs j JOIN users u ON j.user_id = u.id WHERE u.username = ?", 
                    (username.strip(),)
                )
            else:
                cursor.execute("SELECT COUNT(*) as total FROM jobs")
                
            row = cursor.fetchone()
            count = int(row["total"]) if row and "total" in row and row["total"] is not None else 0
            return {"count": count}
        finally:
            try:
                conn.close()
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Lá»—i khi Ä‘áº¿m sá»‘ dá»± Ã¡n (tráº£ vá» 0 máº·c Ä‘á»‹nh): {e}")
        return {"count": 0}


@router.get("/jobs/history")
def get_job_history():
    """
    Láº¥y lá»‹ch sá»­ hoáº¡t Ä‘á»™ng ghi Ä‘Ã¨ hoáº·c chá»‰nh sá»­a dá»± Ã¡n chÃ©o giá»¯a cÃ¡c ngÆ°á»i dÃ¹ng.
    Há»— trá»£ Admin kiá»ƒm soÃ¡t váº¿t truy cáº­p vÃ  bÃ n giao cÃ´ng viá»‡c báº£n váº½. Giá»›i háº¡n tráº£ vá» tá»‘i Ä‘a 100 dÃ²ng má»›i nháº¥t.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT h.project_name, u_old.username as old_user, u_new.username as new_user, h.changed_at
            FROM job_history h
            LEFT JOIN users u_old ON h.old_user_id = u_old.id
            JOIN users u_new ON h.new_user_id = u_new.id
            ORDER BY h.changed_at DESC
            LIMIT 100
        """)
        rows = cursor.fetchall()
        return [{"project_name": r["project_name"], "old_user": r["old_user"], "new_user": r["new_user"], "changed_at": str(r["changed_at"])} for r in rows]
    except Exception as e:
        logger.error(f"Lá»—i khi Ä‘á»c lá»‹ch sá»­ báº£n váº½: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# TASK GROUPS HW (LOCAL CACHE TABLE READ - SUPER FAST)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

import threading
_is_syncing_hw = False
_last_hw_sync_time = 0

def sync_task_groups_hw_to_local_db(limit_val: Optional[int] = None):
    """
    HÃ m cháº¡y ngáº§m Ä‘á»“ng bá»™ TOÃ€N Bá»˜ danh sÃ¡ch Task Groups HW tá»« TaskList Web3 (MSSQL)
    vá» báº£ng cá»¥c bá»™ `task_group_hw_cache` (MySQL / SQLite).
    """
    global _is_syncing_hw, _last_hw_sync_time
    if _is_syncing_hw:
        return
    _is_syncing_hw = True

    try:
        import time
        from app.mssql_db import get_mssql_connection
        from app.database import DB_TYPE

        limit_desc = f"{limit_val} Task" if limit_val else "TOÃ€N Bá»˜ Task"
        logger.info(f"[task-sync] Báº¯t Ä‘áº§u Ä‘á»“ng bá»™ ngáº§m {limit_desc} HW tá»« MSSQL sang Local DB...")
        t0 = time.time()

        mconn = get_mssql_connection()
        mcursor = mconn.cursor(as_dict=True)

        top_clause = f"TOP {limit_val}" if limit_val and limit_val > 0 else ""

        sql = f"""
            SELECT {top_clause}
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,
                tghw.created_at,
                tghw.progress,
                tghw.is_done,
                lj.JobNumber AS job_number,
                lj.Client AS client,
                lj.Builder AS builder,
                aj.MaNV AS ma_nv
            FROM [emsflow].[dbo].[task_group_hw] tghw WITH (NOLOCK)
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj WITH (NOLOCK)
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj WITH (NOLOCK)
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0
            WHERE ISNULL(tghw.is_delete, 0) = 0 AND lj.JobNumber IS NOT NULL
            ORDER BY tghw.created_at DESC
        """

        mcursor.execute(sql)
        rows = mcursor.fetchall()
        mconn.close()

        if not rows:
            logger.warning("[task-sync] KhÃ´ng tÃ¬m tháº¥y báº£n ghi Task HW tá»« MSSQL.")
            return

        lconn = get_db_connection()
        lcursor = lconn.cursor()

        if DB_TYPE == "mysql":
            insert_sql = """
                INSERT INTO task_group_hw_cache (
                    hw_id, id_job_ems, id_assign_ems, job_number, client, builder, ma_nv, progress, is_done, created_at, synced_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE
                    id_job_ems = VALUES(id_job_ems),
                    id_assign_ems = VALUES(id_assign_ems),
                    job_number = VALUES(job_number),
                    client = VALUES(client),
                    builder = VALUES(builder),
                    ma_nv = VALUES(ma_nv),
                    progress = VALUES(progress),
                    is_done = VALUES(is_done),
                    created_at = VALUES(created_at),
                    synced_at = NOW()
            """
            batch_data = []
            for r in rows:
                batch_data.append((
                    r['hw_id'], r['id_job_ems'], r['id_assign_ems'], r['job_number'],
                    r['client'], r['builder'], r['ma_nv'], float(r['progress'] or 0),
                    1 if r['is_done'] else 0, r['created_at']
                ))
            # Thá»±c thi batch
            for item in batch_data:
                lcursor.execute(insert_sql, item)
        else:
            insert_sql = """
                INSERT OR REPLACE INTO task_group_hw_cache (
                    hw_id, id_job_ems, id_assign_ems, job_number, client, builder, ma_nv, progress, is_done, created_at, synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """
            for r in rows:
                lcursor.execute(insert_sql, (
                    r['hw_id'], r['id_job_ems'], r['id_assign_ems'], r['job_number'],
                    r['client'], r['builder'], r['ma_nv'], float(r['progress'] or 0),
                    1 if r['is_done'] else 0, str(r['created_at'])
                ))

        lconn.commit()
        lconn.close()

        _last_hw_sync_time = time.time()
        logger.info(f"[task-sync] Äá»“ng bá»™ thÃ nh cÃ´ng {len(rows)} Task HW vÃ o Local DB trong {round((time.time()-t0)*1000)}ms")

    except Exception as sync_err:
        logger.error(f"[task-sync] Lá»—i Ä‘á»“ng bá»™ ngáº§m Task HW: {sync_err}")
    finally:
        _is_syncing_hw = False


@router.get("/jobs/tasklist-jobs")
async def get_tasklist_jobs(
    ma_nv: Optional[str] = Query(None, description="Lá»c theo mÃ£ nhÃ¢n viÃªn e.g. EZE0098"),
    search: Optional[str] = Query(None, description="TÃ¬m kiáº¿m mÃ£ Job, Client, Builder"),
    limit: int = Query(2000, ge=1, le=20000, description="Sá»‘ lÆ°á»£ng job tá»‘i Ä‘a"),
    force_refresh: bool = Query(False, description="Äá»“ng bá»™ láº¡i tá»« MSSQL")
):
    """
    Láº¥y danh sÃ¡ch Task Groups HW trá»±c tiáº¿p tá»« CSDL Cá»¥c Bá»™ (MySQL / SQLite),
    káº¿t há»£p Ä‘á»‘i chiáº¿u tá»©c thÃ¬ vá»›i báº£ng `jobs` Ä‘á»ƒ gáº¯n tÃ­ch xanh âœ… (< 5ms).
    """
    import time
    from app.database import DB_TYPE

    global _last_hw_sync_time

    # Náº¿u yÃªu cáº§u force_refresh, kÃ­ch hoáº¡t Ä‘á»“ng bá»™ ngáº§m toÃ n bá»™
    if force_refresh:
        threading.Thread(target=sync_task_groups_hw_to_local_db, daemon=True).start()

    conn = get_db_connection()
    cursor = conn.cursor()

    # Kiá»ƒm tra náº¿u báº£ng cache chÆ°a cÃ³ dá»¯ liá»‡u hoáº·c Ä‘Ã£ quÃ¡ 10 phÃºt chÆ°a Ä‘á»“ng bá»™
    cursor.execute("SELECT COUNT(*) AS cnt FROM task_group_hw_cache")
    cnt_row = cursor.fetchone()
    cache_count = cnt_row["cnt"] if isinstance(cnt_row, dict) else (cnt_row[0] if cnt_row else 0)

    if cache_count == 0 or (time.time() - _last_hw_sync_time > 600):
        # Äá»“ng bá»™ Ä‘á»“ng bá»™ láº§n Ä‘áº§u náº¿u cache rá»—ng
        if cache_count == 0:
            sync_task_groups_hw_to_local_db()
        else:
            threading.Thread(target=sync_task_groups_hw_to_local_db, daemon=True).start()

    # XÃ¢y dá»±ng cÃ¢u truy váº¥n Ä‘á»c siÃªu tá»‘c tá»« Local DB
    where_clauses = []
    params = []

    clean_manv = ma_nv.strip() if isinstance(ma_nv, str) and ma_nv.strip() else None
    if clean_manv:
        where_clauses.append("t.ma_nv = ?")
        params.append(clean_manv)

    clean_search = search.strip() if isinstance(search, str) and search.strip() else None
    if clean_search:
        where_clauses.append("(t.job_number LIKE ? OR t.client LIKE ? OR t.builder LIKE ? OR t.ma_nv LIKE ?)")
        sp = f"%{clean_search}%"
        params.extend([sp, sp, sp, sp])

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    limit_val = int(limit) if isinstance(limit, (int, str)) and str(limit).isdigit() else 2000

    if DB_TYPE == "mysql":
        where_sql = where_sql.replace("?", "%s")

    sql = f"""
        SELECT 
            t.hw_id,
            t.id_job_ems,
            t.id_assign_ems,
            t.created_at,
            t.progress,
            t.is_done,
            t.job_number,
            t.client,
            t.builder,
            t.ma_nv,
            j.id AS local_job_id,
            j.project_name AS local_project_name,
            j.room_count,
            j.total_area
        FROM task_group_hw_cache t
        LEFT JOIN jobs j ON LOWER(TRIM(t.job_number)) = LOWER(TRIM(j.project_name))
        {where_sql}
        ORDER BY t.created_at DESC
        LIMIT {limit_val}
    """

    cursor.execute(sql, tuple(params) if params else None)
    rows = cursor.fetchall()
    conn.close()

    results = []
    for r in rows:
        item = dict(r) if isinstance(r, dict) or hasattr(r, "keys") else {
            "hw_id": r[0], "id_job_ems": r[1], "id_assign_ems": r[2], "created_at": str(r[3]),
            "progress": float(r[4] or 0), "is_done": bool(r[5]), "job_number": r[6], "client": r[7],
            "builder": r[8], "ma_nv": r[9], "local_job_id": r[10], "local_project_name": r[11],
            "room_count": r[12], "total_area": r[13]
        }

        has_local = bool(item.get("local_job_id"))
        results.append({
            "hw_id": item.get("hw_id"),
            "id_job_ems": item.get("id_job_ems"),
            "id_assign_ems": item.get("id_assign_ems"),
            "created_at": str(item.get("created_at") or ""),
            "progress": item.get("progress"),
            "is_done": item.get("is_done"),
            "job_number": item.get("job_number"),
            "client": item.get("client"),
            "builder": item.get("builder"),
            "ma_nv": item.get("ma_nv"),
            "has_local_job": has_local,
            "local_job": {
                "id": item.get("local_job_id"),
                "project_name": item.get("local_project_name") or item.get("job_number"),
                "room_count": item.get("room_count"),
                "total_area": item.get("total_area")
            } if has_local else None
        })

    return {
        "status": "success",
        "total": len(results),
        "completed_count": sum(1 for r in results if r["has_local_job"]),
        "data": results,
        "source": "local_database"
    }


@router.get("/jobs/progress-report")
@router.get("/api/jobs/progress-report")
def get_jobs_progress_report(
    start_date: Optional[str] = Query(None, description="Tá»« ngÃ y YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Äáº¿n ngÃ y YYYY-MM-DD"),
    username: Optional[str] = Query(None, description="Lá»c theo nhÃ¢n viÃªn/User"),
    search: Optional[str] = Query(None, description="TÃ¬m tÃªn job / project name"),
    status: Optional[str] = Query(None, description="all | completed | pending"),
    limit: int = Query(2000, ge=1, le=10000),
    offset: int = Query(0, ge=0)
):
    """
    BÃ¡o cÃ¡o tiáº¿n Ä‘á»™ cÃ´ng viá»‡c tá»•ng há»£p (Job Progress & Productivity Report).
    Bao gá»“m toÃ n bá»™ Task nhÃ³m HW vÃ  cÃ¡c Job váº½ trÃªn há»‡ thá»‘ng EzeFloor.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        from app.database import DB_TYPE
        
        where_clauses = []
        params = []
        
        if username and username.strip() and username.strip() != "all":
            u_clean = username.strip()
            where_clauses.append("(LOWER(TRIM(t.username)) = LOWER(?) OR LOWER(TRIM(t.staff_code)) = LOWER(?))")
            params.extend([u_clean, u_clean])
            
        if search and search.strip():
            sp = f"%{search.strip()}%"
            where_clauses.append("(t.project_name LIKE ? OR t.username LIKE ? OR t.staff_code LIKE ? OR t.client LIKE ? OR t.builder LIKE ?)")
            params.extend([sp, sp, sp, sp, sp])
            
        if start_date and start_date.strip():
            where_clauses.append("t.created_at >= ?")
            params.append(f"{start_date.strip()} 00:00:00")
            
        if end_date and end_date.strip():
            where_clauses.append("t.created_at <= ?")
            params.append(f"{end_date.strip()} 23:59:59")
            
        if status == "completed":
            where_clauses.append("t.is_completed = 1")
        elif status == "pending":
            where_clauses.append("t.is_completed = 0")
            
        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        
        base_union_sql = """
            SELECT 
                t.hw_id,
                t.id_job_ems,
                t.id_assign_ems,
                j.project_name,
                t.client,
                t.builder,
                COALESCE(t.ma_nv, u.username, 'Admin') AS staff_code,
                COALESCE(u.username, t.ma_nv, 'Admin') AS username,
                u.email,
                COALESCE(j.room_count, 0) AS room_count,
                COALESCE(j.total_area, 0.0) AS total_area,
                j.created_at,
                j.id AS local_job_id,
                COALESCE(j.is_trained, 0) AS is_trained,
                j.thumbnail,
                CASE WHEN j.is_trained = 1 OR t.is_done = 1 OR t.progress >= 100 THEN 1 ELSE 0 END AS is_completed,
                CASE WHEN j.is_trained = 1 OR t.is_done = 1 OR t.progress >= 100 THEN 100.0 ELSE COALESCE(t.progress, 100.0) END AS progress
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            LEFT JOIN task_group_hw_cache t ON LOWER(TRIM(t.job_number)) = LOWER(TRIM(j.project_name))
        """
        
        sql = f"""
            SELECT * FROM (
                {base_union_sql}
            ) t
            {where_sql}
            ORDER BY t.created_at DESC
            LIMIT {limit} OFFSET {offset}
        """
        
        if DB_TYPE == "mysql":
            sql = sql.replace("?", "%s")
            
        cursor.execute(sql, tuple(params) if params else None)
        rows = cursor.fetchall()
        
        items = []
        total_area_sum = 0.0
        total_rooms_sum = 0
        completed_count = 0
        
        for r in rows:
            d = dict(r)
            is_comp = bool(d.get("is_completed") == 1)
            if is_comp:
                completed_count += 1
                
            total_area_sum += float(d.get("total_area") or 0)
            total_rooms_sum += int(d.get("room_count") or 0)
            
            created_str = str(d.get("created_at") or "")
            completed_str = created_str if is_comp else None
            
            items.append({
                "id": d.get("local_job_id") or d.get("id_assign_ems") or d.get("hw_id"),
                "local_job_id": d.get("local_job_id"),
                "hw_id": d.get("hw_id"),
                "id_job_ems": d.get("id_job_ems"),
                "id_assign_ems": d.get("id_assign_ems"),
                "project_name": d.get("project_name"),
                "staff_code": d.get("staff_code"),
                "username": d.get("username") or d.get("staff_code") or "Unknown",
                "email": d.get("email"),
                "client": d.get("client"),
                "builder": d.get("builder"),
                "created_at": created_str,
                "completed_at": completed_str,
                "is_completed": is_comp,
                "progress": float(d.get("progress") or 0),
                "room_count": int(d.get("room_count") or 0),
                "total_area": float(d.get("total_area") or 0),
                "is_trained": int(d.get("is_trained") or 0),
                "thumbnail": d.get("thumbnail")
            })
            
        return {
            "status": "success",
            "total_jobs": len(items),
            "completed_jobs": completed_count,
            "pending_jobs": len(items) - completed_count,
            "total_area": round(total_area_sum, 2),
            "total_rooms": total_rooms_sum,
            "items": items
        }
    except Exception as e:
        logger.error(f"[get_jobs_progress_report] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/{username}", response_model=List[JobResponse])
def get_user_jobs(username: str, limit: int = 20, offset: int = 0, current_user: str = Depends(validate_session)):
    """
    Láº¥y danh sÃ¡ch cÃ¡c dá»± Ã¡n thuá»™c quyá»n sá»Ÿ há»¯u cá»§a má»™t ngÆ°á»i dÃ¹ng cá»¥ thá»ƒ.
    - Há»— trá»£ phÃ¢n trang báº±ng `limit` vÃ  `offset`.
    - YÃªu cáº§u xÃ¡c thá»±c phiÃªn Ä‘Äƒng nháº­p há»£p lá»‡.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT j.id, j.project_name, j.room_count, j.total_area, j.created_at, j.thumbnail, j.is_trained, j.is_corrected, j.share_token
            FROM jobs j
            JOIN users u ON j.user_id = u.id
            WHERE u.username = ?
            ORDER BY j.created_at DESC
            LIMIT ? OFFSET ?
        """, (username, limit, offset))

        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/all-jobs", response_model=List[JobAllResponse])
def get_all_jobs(limit: int = 50, offset: int = 0):
    """
    Láº¥y danh sÃ¡ch toÃ n bá»™ cÃ¡c dá»± Ã¡n cá»§a má»i ngÆ°á»i dÃ¹ng trong há»‡ thá»‘ng (dÃ nh cho Admin quáº£n trá»‹).
    - Há»— trá»£ phÃ¢n trang vÃ  sáº¯p xáº¿p theo má»‘c thá»i gian táº¡o giáº£m dáº§n (má»›i nháº¥t hiá»ƒn thá»‹ Ä‘áº§u tiÃªn).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA table_info(jobs)")
        cols = {row[1] for row in cursor.fetchall()}
        
        select_cols = ["j.id", "j.project_name", "j.room_count", "j.total_area", "j.created_at", "u.username", "j.thumbnail"]
        select_cols.append("j.is_trained" if "is_trained" in cols else "0 AS is_trained")
        select_cols.append("j.is_corrected" if "is_corrected" in cols else "0 AS is_corrected")
        select_cols.append("j.share_token" if "share_token" in cols else "NULL AS share_token")
        
        sql = f"""
            SELECT {', '.join(select_cols)}
            FROM jobs j
            JOIN users u ON j.user_id = u.id
            ORDER BY j.created_at DESC
            LIMIT ? OFFSET ?
        """
        cursor.execute(sql, (limit, offset))
        rows = cursor.fetchall()
        
        result = []
        for r in rows:
            d = dict(r)
            if d.get("is_trained") is None: d["is_trained"] = 0
            if d.get("is_corrected") is None: d["is_corrected"] = 0
            result.append(d)
        return result
    except Exception as e:
        logger.error(f"[get_all_jobs] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/data/{job_id}")
def get_job_data(job_id: int, username: str = Depends(validate_session)):
    """
    Láº¥y chi tiáº¿t chuá»—i dá»¯ liá»‡u tráº¡ng thÃ¡i báº£n váº½ cá»§a má»™t dá»± Ã¡n thÃ´ng qua ID.
    - YÃªu cáº§u xÃ¡c thá»±c phiÃªn Ä‘Äƒng nháº­p há»£p lá»‡.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT data FROM jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y dá»± Ã¡n Ä‘Æ°á»£c yÃªu cáº§u.")
        return {"status": "success", "data": row["data"]}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/find")
@router.get("/api/jobs/find")
def find_job(query: str):
    """
    TÃ¬m kiáº¿m vÃ  náº¡p dá»¯ liá»‡u dá»± Ã¡n theo:
    - ID sá»‘ nguyÃªn (vÃ­ dá»¥: 123)
    - Hoáº·c TÃªn dá»± Ã¡n / MÃ£ Job Number (vÃ­ dá»¥: 'JOB-2024-001', 'P-101', ...)
    """
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query is required")
    
    clean_query = query.strip()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        row = None
        # 1. Thá»­ tÃ¬m theo ID sá»‘ nguyÃªn
        if clean_query.isdigit():
            cursor.execute(
                "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE id = ?",
                (int(clean_query),)
            )
            row = cursor.fetchone()

        # 2. Náº¿u khÃ´ng tháº¥y, tÃ¬m chÃ­nh xÃ¡c theo project_name (khÃ´ng phÃ¢n biá»‡t hoa thÆ°á»ng)
        if not row:
            cursor.execute(
                "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE LOWER(project_name) = LOWER(?) ORDER BY created_at DESC LIMIT 1",
                (clean_query,)
            )
            row = cursor.fetchone()

        # 3. Náº¿u váº«n khÃ´ng tháº¥y, thá»­ tÃ¬m LIKE '%query%'
        if not row:
            cursor.execute(
                "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE LOWER(project_name) LIKE LOWER(?) ORDER BY created_at DESC LIMIT 1",
                (f"%{clean_query}%",)
            )
            row = cursor.fetchone()

        if row:
            row_dict = dict(row)
            return {
                "status": "success",
                "found": True,
                "job_id": row_dict["id"],
                "project_name": row_dict["project_name"],
                "room_count": row_dict.get("room_count", 0),
                "total_area": row_dict.get("total_area", 0.0),
                "data": row_dict["data"]
            }
        else:
            return {
                "status": "success",
                "found": False,
                "job_id": None,
                "project_name": clean_query,
                "data": None
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


class RenameJobRequest(BaseModel):
    """MÃ´ hÃ¬nh dá»¯ liá»‡u Ä‘á»ƒ Ä‘á»•i tÃªn dá»± Ã¡n."""
    new_name: str


@router.put("/jobs/{job_id}/rename")
def rename_job(job_id: int, req: RenameJobRequest):
    """
    Äá»•i tÃªn má»™t dá»± Ã¡n báº£n váº½ dá»±a vÃ o ID.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE jobs SET project_name = ? WHERE id = ?", (req.new_name, job_id))
        conn.commit()
        return {"status": "success", "message": "ÄÃ£ Ä‘á»•i tÃªn dá»± Ã¡n thÃ nh cÃ´ng."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/jobs/{job_id}")
def delete_job(job_id: int):
    """
    XÃ³a bá» hoÃ n toÃ n má»™t dá»± Ã¡n khá»i há»‡ thá»‘ng.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()
        
        try:
            from services.search.vector_search_engine import clear_project_index_cache
            clear_project_index_cache(job_id)
        except Exception:
            pass
            
        return {"status": "success", "message": "XÃ³a dá»± Ã¡n thÃ nh cÃ´ng."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


class MarkTrainedRequest(BaseModel):
    """MÃ´ hÃ¬nh dá»¯ liá»‡u Ä‘Ã¡nh dáº¥u dá»± Ã¡n Ä‘Ã£ Ä‘Æ°á»£c huáº¥n luyá»‡n AI."""
    project_name: str
    username: str


@router.post("/jobs/mark-trained")
def mark_job_trained(req: MarkTrainedRequest, username: str = Depends(validate_session)):
    """
    ÄÃ¡nh dáº¥u dá»± Ã¡n Ä‘Ã£ Ä‘Æ°á»£c sá»­ dá»¥ng dá»¯ liá»‡u Ä‘á»ƒ huáº¥n luyá»‡n láº¡i cÃ¡c mÃ´ hÃ¬nh AI YOLO/OCR.
    Äiá»u nÃ y giÃºp theo dÃµi vÃ²ng Ä‘á»i dá»¯ liá»‡u pháº£n há»“i tá»« thá»±c táº¿ cá»§a ngÆ°á»i dÃ¹ng.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Láº¥y user_id dá»±a trÃªn username gá»­i lÃªn
        cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y ngÆ°á»i dÃ¹ng trong há»‡ thá»‘ng.")
        
        user_id = user_row["id"]
        
        # Cáº­p nháº­t trÆ°á»ng dá»¯ liá»‡u is_trained = 1
        cursor.execute("""
            UPDATE jobs SET is_trained = 1 
            WHERE project_name = ? AND user_id = ?
        """, (req.project_name, user_id))
        conn.commit()
        return {"status": "success", "message": "ÄÃ£ cáº­p nháº­t tráº¡ng thÃ¡i huáº¥n luyá»‡n thÃ nh cÃ´ng."}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/jobs/{job_id}/share")
def toggle_share(job_id: int, active: bool, username: str = Depends(validate_session)):
    """
    Báº­t hoáº·c táº¯t tÃ­nh nÄƒng chia sáº» dá»± Ã¡n cÃ´ng khai cho ngÆ°á»i ngoÃ i há»‡ thá»‘ng xem.
    - Náº¿u báº­t (`active = True`): Táº¡o ra má»™t Token báº£o máº­t duy nháº¥t ngáº«u nhiÃªn.
    - Náº¿u táº¯t (`active = False`): XÃ³a Token chia sáº» (khiáº¿n Ä‘Æ°á»ng dáº«n cÅ© bá»‹ vÃ´ hiá»‡u hÃ³a tá»©c thÃ¬).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        token = secrets.token_urlsafe(16) if active else None
        cursor.execute("UPDATE jobs SET share_token = ? WHERE id = ?", (token, job_id))
        conn.commit()
        return {"status": "success", "share_token": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/jobs/share/{token}")
def get_shared_job(token: str):
    """
    Xem báº£n váº½ dá»± Ã¡n cÃ´ng khai khÃ´ng cáº§n Ä‘Äƒng nháº­p thÃ´ng qua Token báº£o máº­t.
    Má»¥c Ä‘Ã­ch: Cho phÃ©p ngÆ°á»i dÃ¹ng gá»­i báº£n váº½ dá»± Ã¡n trá»±c tiáº¿p cho khÃ¡ch hÃ ng xem qua má»™t Ä‘Æ°á»ng dáº«n Ä‘á»™c nháº¥t.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT project_name, data, room_count, total_area FROM jobs WHERE share_token = ?", 
            (token,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=404, 
                detail="LiÃªn káº¿t chia sáº» dá»± Ã¡n khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ háº¿t hiá»‡u lá»±c."
            )
        return {
            "status": "success", 
            "project_name": row["project_name"], 
            "data": row["data"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
# LOOKUP JOB BY EMS ID (SSO deep-link tá»« TaskList Web3)
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

@router.get("/jobs/open-by-ems/{ems_id}")
async def get_job_by_ems_id(ems_id: str, username: str = Depends(validate_session)):
    from app.mssql_db import get_mssql_connection

    conn = None
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        sql = """
            SELECT
                tghw.id AS hw_id,
                tghw.id_job_ems,
                tghw.id_assign_ems,
                lj.JobNumber AS job_number,
                lj.Client AS client,
                UPPER(LTRIM(RTRIM(
    CASE
        WHEN lj.Client LIKE 'Bunnings NSW%' THEN 'BUN-NSW-ACT'
        ELSE COALESCE(NULLIF(lc.ShortName, ''), lj.Client)
    END
))) AS customer_short_name,
                lj.Builder AS builder,
                aj.MaNV AS ma_nv
            FROM [emsflow].[dbo].[task_group_hw] tghw
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
                ON tghw.id_job_ems = lj.IDJob
                AND ISNULL(lj.IsDelete, 0) = 0
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListClient] lc
                ON lc.ClientName = lj.Client
                AND ISNULL(lc.IsDelete, 0) = 0
            LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj
                ON tghw.id_assign_ems = aj.ID
                AND ISNULL(aj.IsDelete, 0) = 0
            WHERE
                tghw.id_job_ems = %s
                AND ISNULL(tghw.is_delete, 0) = 0
        """

        cursor.execute(sql, (ems_id,))
        row = cursor.fetchone()

        if not row:
            logger.warning(f"[open-by-ems] KhÃ´ng tÃ¬m tháº¥y HW Job vá»›i id_job_ems={ems_id}")
            raise HTTPException(
                status_code=404,
                detail=f"KhÃ´ng tÃ¬m tháº¥y Job EMS vá»›i ID: {ems_id}"
            )

        # Serialize káº¿t quáº£
        result = {}
        for key, val in row.items():
            if val is None:
                result[key] = None
            elif isinstance(val, (int, float, str, bool)):
                result[key] = val
            else:
                result[key] = str(val)

        logger.info(f"[open-by-ems] TÃ¬m tháº¥y HW Job: hw_id={result.get('hw_id')}, job_number={result.get('job_number')}")

        # Tra cá»©u xem trong CSDL báº£n váº½ ná»™i bá»™ (SQLite/MySQL) Ä‘Ã£ cÃ³ project nÃ o lÆ°u theo job_number chÆ°a
        local_job = None
        job_number = result.get("job_number")
        if job_number:
            try:
                local_conn = get_db_connection()
                local_cursor = local_conn.cursor()
                local_cursor.execute(
                    "SELECT id, project_name, data, room_count, total_area FROM jobs WHERE project_name = ? ORDER BY id DESC LIMIT 1",
                    (job_number,)
                )
                local_row = local_cursor.fetchone()
                if local_row:
                    local_job = {
                        "id": local_row["id"],
                        "project_name": local_row["project_name"],
                        "room_count": local_row["room_count"],
                        "total_area": local_row["total_area"],
                        "data": local_row["data"]
                    }
                local_conn.close()
            except Exception as ex:
                logger.warning(f"[open-by-ems] KhÃ´ng thá»ƒ kiá»ƒm tra local jobs: {ex}")

        result["local_job"] = local_job

        return {
            "status": "success",
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[open-by-ems] Lá»—i truy váº¥n MSSQL: {e}")
        raise HTTPException(status_code=500, detail=f"Lá»—i truy váº¥n MSSQL: {str(e)}")
    finally:
        if conn:
            conn.close()


@router.post("/jobs/export-procurement")
@router.post("/api/jobs/export-procurement")
async def export_procurement(payload: dict):
    """
    Chuyá»ƒn tiáº¿p gÃ³i dá»¯ liá»‡u Job tá»« EzeFloor sang dá»‹ch vá»¥ Procurement.
    Tá»± Ä‘á»™ng truy xuáº¥t vÃ  Ä‘Ã­nh kÃ¨m toÃ n bá»™ 12 cá»™t cá»§a Job tá»« CSDL SQLite (ezefloor.db):
    id, user_id, project_name, room_count, total_area, data (JSON CAD/BIM), thumbnail,
    is_trained, is_corrected, share_token, is_exported, created_at.
    """
    import httpx

    # 1. Truy xuáº¥t báº£n ghi Ä‘áº§y Ä‘á»§ 12 cá»™t tá»« báº£ng jobs trong CSDL
    db_job_record = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        proj_name = payload.get("projectName") or payload.get("project_name") or payload.get("job_number") or payload.get("job_num")
        job_id = payload.get("jobId") or payload.get("id") or payload.get("ems_id")

        cursor.execute(
            """
            SELECT id, user_id, project_name, room_count, total_area, data, thumbnail, 
                   is_trained, is_corrected, share_token, is_exported, created_at 
            FROM jobs 
            WHERE project_name = ? OR id = ? 
            ORDER BY id DESC LIMIT 1
            """,
            (proj_name, job_id)
        )
        row = cursor.fetchone()
        if row:
            db_job_record = dict(row)
            # Cáº­p nháº­t cá» is_exported = 1
            try:
                cursor.execute("UPDATE jobs SET is_exported = 1 WHERE id = ?", (row["id"],))
                conn.commit()
            except Exception:
                pass
        conn.close()
    except Exception as e:
        logger.warning(f"[export_procurement] Lá»—i trÃ­ch xuáº¥t báº£n ghi SQLite job: {e}")

    # 2. ÄÃ­nh kÃ¨m thÃ´ng tin báº£n ghi DB vÃ o payload gá»­i Ä‘i
    if db_job_record:
        payload["job_record"] = db_job_record
        payload["db_job"] = {
            "id": db_job_record.get("id"),
            "user_id": db_job_record.get("user_id"),
            "project_name": db_job_record.get("project_name"),
            "room_count": db_job_record.get("room_count"),
            "total_area": db_job_record.get("total_area"),
            "thumbnail": db_job_record.get("thumbnail"),
            "is_trained": db_job_record.get("is_trained"),
            "is_corrected": db_job_record.get("is_corrected"),
            "share_token": db_job_record.get("share_token"),
            "is_exported": 1,
            "created_at": db_job_record.get("created_at")
        }

    target_url = "http://14.241.197.188:7642/api/receive-job"
    token = payload.get("token")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(target_url, json=payload, headers=headers)
            if res.status_code in [200, 201, 204]:
                return {
                    "status": "success",
                    "remote_status": res.status_code,
                    "remote_data": res.text,
                    "job_record": db_job_record
                }
            else:
                return {
                    "status": "success",
                    "mode": "client_sso",
                    "remote_status": res.status_code,
                    "message": "Frontend Web App (Client-side SSO & deep-link active)",
                    "job_record": db_job_record
                }
    except Exception as e:
        logger.info(f"[Procurement] Chuyá»ƒn tiáº¿p qua giao thá»©c Client-side SSO: {e}")
        return {
            "status": "success",
            "mode": "client_sso",
            "message": "Client-side SSO active",
            "job_record": db_job_record
        }



