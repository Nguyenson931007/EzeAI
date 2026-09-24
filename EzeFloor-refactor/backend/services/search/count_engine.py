from typing import List, Dict, Any
import csv
import io
import json

class CountEngine:
    @staticmethod
    def count_results(matched_objects: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Groups similar objects by their raw class name (for tests compatibility)
        and standardized categories (for frontend report representation, Requirement 7).
        """
        groups = {}
        categories = {}
        subgroups = {}
        
        for obj in matched_objects:
            raw_cls = obj.get("class", "unknown")
            
            # 1. Raw groups (keeps tests happy)
            groups[raw_cls] = groups.get(raw_cls, 0) + 1
            
            # 2. Standardized categories (Requirement 7)
            cat = raw_cls.capitalize()
            if "door" in raw_cls.lower():
                cat = "Door"
            elif "window" in raw_cls.lower():
                cat = "Window"
            elif "wc" in raw_cls.lower() or "toilet" in raw_cls.lower():
                cat = "WC"
            elif "shower" in raw_cls.lower():
                cat = "Shower"
                
            categories[cat] = categories.get(cat, 0) + 1
            
            # 3. Subgroups breakdown under categories
            if cat not in subgroups:
                subgroups[cat] = {}
                
            sub_label = None
            width = obj.get("width_mm")
            dtype = obj.get("door_type")
            rtype = obj.get("room_type")
            
            if width:
                sub_label = f"{width}mm"
            elif dtype:
                sub_label = dtype.capitalize()
            elif rtype:
                sub_label = rtype.capitalize()
            else:
                sub_label = raw_cls.capitalize()
                
            subgroups[cat][sub_label] = subgroups[cat].get(sub_label, 0) + 1
            
        return {
            "total_count": len(matched_objects),
            "groups": groups,
            "categories": categories,
            "subgroups": subgroups,
            "results": matched_objects
        }
        
    @staticmethod
    def export_report(matched_objects: List[Dict[str, Any]], format_type: str = "json") -> str:
        """
        Exports the count report as CSV, Excel, or JSON.
        For CSV/Excel, outputs structural columns: Drawing, Object, Count, Location, Room, Confidence.
        """
        if format_type.lower() not in ["csv", "excel"]:
            if format_type.lower() == "json":
                return json.dumps(matched_objects, indent=2)
            return json.dumps(matched_objects, indent=2)
            
        # Fetch project rooms for spatial join
        rooms_by_page = {}
        project_ids = [obj.get("project_id") for obj in matched_objects if obj.get("project_id")]
        
        if project_ids:
            proj_id = project_ids[0]
            try:
                from app.database import get_db_connection
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT data FROM jobs WHERE id = ?", (proj_id,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    job_data = json.loads(row["data"])
                    rooms_by_page = job_data.get("roomsByPage", {})
            except Exception as e:
                print(f"Error loading rooms for takeoff export: {e}")
                
        # Helper to find room containing center point
        from services.search.ocr_search_engine import point_in_polygon
        
        def find_room_for_object(page_idx: int, bbox: list) -> str:
            page_rooms = rooms_by_page.get(str(page_idx), []) or rooms_by_page.get(page_idx, [])
            if not page_rooms:
                return "None"
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            for r in page_rooms:
                if point_in_polygon(cx, cy, r.get("polygon", [])):
                    return r.get("room_name", "Room")
            return "None"

        # Generate Excel/CSV report
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Drawing/Floor", "Object", "Count", "Location", "Room", "Confidence"])
        
        for obj in matched_objects:
            bbox = obj.get("bbox", [0, 0, 0, 0])
            loc_str = f"({int((bbox[0]+bbox[2])/2)}, {int((bbox[1]+bbox[3])/2)})"
            page_idx = obj.get("page", 0)
            
            # Find containing room
            room_name = find_room_for_object(page_idx, bbox)
            
            # Format similarity
            sim = obj.get("similarity", 1.0)
            conf_str = f"{int(sim * 100)}%"
            
            writer.writerow([
                f"Floor {page_idx + 1}",
                obj.get("class", "object"),
                1,
                loc_str,
                room_name,
                conf_str
            ])
            
        return output.getvalue()
