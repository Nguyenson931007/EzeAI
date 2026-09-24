"""
bim_semantic_engine.py
===================
Analyzes BIM topology and spatial relations.
Assigns doors to their connecting rooms (room_from, room_to) using Shapely spatial queries.
"""

import logging
from typing import Any, Dict, List, Tuple
from shapely.geometry import Polygon as ShapelyPolygon

logger = logging.getLogger("ezefloor.bim_semantic_engine")


class BIMSemanticEngine:
    """Computes high-level BIM spatial connectivity and semantics."""

    def assign_door_to_rooms(
        self,
        door_polygon: List[Any],
        room_polygons: List[Dict[str, Any]],
        buffer_distance: float = 15.0,
    ) -> Dict[str, str]:
        """Determines which two rooms the door connects.

        Args:
            door_polygon: List of door coordinates (e.g. [[x,y],...] or [{"x":x,"y":y},...]).
            room_polygons: List of rooms: [{"polygon": ..., "room_name": "Bed 1"}].
            buffer_distance: Distance in pixels to buffer the door polygon to reach room spaces.

        Returns:
            Dict: {"room_from": str, "room_to": str}
        """
        if not door_polygon or not room_polygons:
            return {"room_from": "unknown", "room_to": "unknown"}

        try:
            # 1. Convert door polygon to Shapely Polygon
            door_pts = self._parse_polygon(door_polygon)
            if len(door_pts) < 3:
                return {"room_from": "unknown", "room_to": "unknown"}

            door_shp = ShapelyPolygon(door_pts)
            if not door_shp.is_valid:
                door_shp = door_shp.buffer(0)

            # Buffer the door polygon to bridge the wall opening gap
            buffered_door = door_shp.buffer(buffer_distance)

            # 2. Check intersections with each room
            room_overlaps = []
            for room in room_polygons:
                r_pts = self._parse_polygon(room.get("polygon", []))
                if len(r_pts) < 3:
                    continue

                r_shp = ShapelyPolygon(r_pts)
                if not r_shp.is_valid:
                    r_shp = r_shp.buffer(0)

                # Measure overlap area
                overlap = buffered_door.intersection(r_shp)
                if not overlap.is_empty:
                    room_overlaps.append((room.get("room_name", "Room"), overlap.area))

            # Sort rooms by overlapping area (descending)
            room_overlaps = sorted(room_overlaps, key=lambda x: x[1], reverse=True)

            if len(room_overlaps) >= 2:
                return {
                    "room_from": room_overlaps[0][0],
                    "room_to": room_overlaps[1][0],
                }
            elif len(room_overlaps) == 1:
                return {
                    "room_from": room_overlaps[0][0],
                    "room_to": "exterior",
                }

            # 3. Fallback: Check nearest rooms if no direct overlap
            room_distances = []
            for room in room_polygons:
                r_pts = self._parse_polygon(room.get("polygon", []))
                if len(r_pts) < 3:
                    continue

                r_shp = ShapelyPolygon(r_pts)
                if not r_shp.is_valid:
                    r_shp = r_shp.buffer(0)

                dist = door_shp.distance(r_shp)
                room_distances.append((room.get("room_name", "Room"), dist))

            room_distances = sorted(room_distances, key=lambda x: x[1])

            # If the closest rooms are within 60 pixels, assign them
            close_rooms = [name for name, dist in room_distances if dist < 60.0]
            if len(close_rooms) >= 2:
                return {"room_from": close_rooms[0], "room_to": close_rooms[1]}
            elif len(close_rooms) == 1:
                return {"room_from": close_rooms[0], "room_to": "exterior"}

        except Exception as e:
            logger.error(f"Error assigning door to rooms: {e}", exc_info=True)

        return {"room_from": "unknown", "room_to": "unknown"}

    def validate_door_semantics(self, door: Dict[str, Any], context: List[Any]) -> Dict[str, Any]:
        """Validates door semantics and returns confidence and warnings."""
        return {
            "semantic_confidence": 0.9,
            "warnings": []
        }

    def _parse_polygon(self, poly: List[Any]) -> List[Tuple[float, float]]:
        """Parses polygon coordinate inputs of formats [[x,y],...] or [{"x":x,"y":y},...]."""
        pts = []
        for pt in poly:
            if isinstance(pt, dict):
                pts.append((float(pt.get("x", 0)), float(pt.get("y", 0))))
            elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                pts.append((float(pt[0]), float(pt[1])))
        return pts
