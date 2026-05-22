import re
from collections import defaultdict
from typing import List, Dict, Optional

# =========================================================
# 1️⃣ CONFIGURATION
# =========================================================

KEYWORD_WEIGHTS = {
    # Outdoor
    "DECK": ("outdoor", "outdoor_space", 0.9),
    "BALCONY": ("outdoor", "outdoor_space", 0.9),
    "TERRACE": ("outdoor", "outdoor_space", 0.9),
    "VERANDA": ("outdoor", "outdoor_space", 0.9),

    # Sleeping
    "BED": ("indoor", "sleeping_space", 0.8),
    "BEDROOM": ("indoor", "sleeping_space", 0.9),
    "MASTER": ("indoor", "sleeping_space", 0.7),

    # Living
    "LIVING": ("indoor", "living_space", 0.8),
    "LOUNGE": ("indoor", "living_space", 0.8),
    "DINING": ("indoor", "living_space", 0.7),

    # Kitchen
    "KITCHEN": ("indoor", "cooking_space", 0.9),
    "WIP": ("service", "storage_space", 0.7),

    # Sanitary
    "BATH": ("indoor", "sanitary_space", 0.95),
    "BATHROOM": ("indoor", "sanitary_space", 0.95),
    "WC": ("indoor", "sanitary_space", 0.95),
    "TOILET": ("indoor", "sanitary_space", 1.0),
    "ENS": ("indoor", "sanitary_space", 0.9),
    "LAUNDRY": ("service", "service_space", 0.8),

    # Service
    "PANTRY": ("service", "storage_space", 0.7),
    "STORE": ("service", "storage_space", 0.7),
    "GARAGE": ("service", "mechanical_space", 0.9),

    # Circulation
    "HALL": ("circulation", "transition_space", 0.7),
    "HALLWAY": ("circulation", "transition_space", 0.7),
    "CORRIDOR": ("circulation", "transition_space", 0.8),
}

OBJECT_WEIGHTS = {
    "toilet": ("sanitary_space", 1.0),
    "shower": ("sanitary_space", 1.0),
    "bathtub": ("sanitary_space", 1.0),
    "sink": ("sanitary_space", 0.6),
    "floor_drain": ("sanitary_space", 1.0),
    "stove": ("cooking_space", 1.0),
    "oven": ("cooking_space", 0.8),
    "bed": ("sleeping_space", 0.9),
    "washing_machine": ("service_space", 0.8),
}

BIM_MAP = {
    "sleeping_space": "IfcSpace.SleepingArea",
    "sanitary_space": "IfcSpace.SanitaryArea",
    "cooking_space": "IfcSpace.KitchenArea",
    "living_space": "IfcSpace.LivingArea",
    "outdoor_space": "IfcSpace.External",
    "storage_space": "IfcSpace.Storage",
    "service_space": "IfcSpace.Service",
    "mechanical_space": "IfcSpace.Mechanical",
    "transition_space": "IfcSpace.Circulation"
}


# =========================================================
# 2️⃣ UTILITIES
# =========================================================

def normalize(text: str) -> str:
    return re.sub(r"[^A-Z]", "", text.upper())


def argmax(d: Dict[str, float], default="unknown"):
    if not d:
        return default
    return max(d, key=d.get)


# =========================================================
# 3️⃣ CORE ENGINE
# =========================================================

def classify_rooms(
    room_name: str = "",
    detected_objects: Optional[List[Dict]] = None,
    area_m2: Optional[float] = None,
    outside_contact_ratio: Optional[float] = None,
    adjacent_functions: Optional[List[str]] = None
) -> Dict:

    detected_objects = detected_objects or []
    adjacent_functions = adjacent_functions or []

    scores = {
        "zone": defaultdict(float),
        "function": defaultdict(float),
        "wetness": defaultdict(float)
    }

    explanations = []
    name = normalize(room_name)

    # -----------------------------------------------------
    # 1️⃣ KEYWORD SCORING
    # -----------------------------------------------------
    for kw, (zone, function, weight) in KEYWORD_WEIGHTS.items():
        if kw in name:
            scores["zone"][zone] += weight
            scores["function"][function] += weight
            explanations.append(f"keyword '{kw}' +{weight}")

            # 🔥 ADD THIS
            if function == "sanitary_space":
                scores["wetness"]["wet"] += weight
                explanations.append("keyword implies wetness +{weight}")

    # -----------------------------------------------------
    # 2️⃣ OBJECT SCORING
    # -----------------------------------------------------
    for obj in detected_objects:
        cls = obj.get("class", "").lower()

        if cls in OBJECT_WEIGHTS:
            function, weight = OBJECT_WEIGHTS[cls]
            scores["function"][function] += weight
            explanations.append(f"object '{cls}' +{weight}")

            if function == "sanitary_space":
                scores["wetness"]["wet"] += weight

    # -----------------------------------------------------
    # 3️⃣ GEOMETRY SIGNALS
    # -----------------------------------------------------
    if outside_contact_ratio is not None:
        if outside_contact_ratio > 0.6:
            scores["zone"]["outdoor"] += 0.8
            explanations.append("outside_contact_ratio > 0.6 +0.8")

    if area_m2:
        if area_m2 < 3:
            scores["function"]["storage_space"] += 0.4
            explanations.append("area < 3m2 suggests storage +0.4")

    # -----------------------------------------------------
    # 4️⃣ ADJACENCY SIGNAL
    # -----------------------------------------------------
    if "sanitary_space" in adjacent_functions:
        scores["function"]["sanitary_space"] += 0.3
        explanations.append("adjacent to sanitary +0.3")

    # -----------------------------------------------------
    # 5️⃣ DETERMINE PRIMARY LABELS
    # -----------------------------------------------------
    zone = argmax(scores["zone"])
    function = argmax(scores["function"])

    wetness = "dry"
    if function == "sanitary_space":
        wetness = "wet"
    elif scores["wetness"].get("wet", 0) > 0.5:
        wetness = "wet"

    # -----------------------------------------------------
    # 6️⃣ CONFLICT RESOLVER
    # -----------------------------------------------------
    if zone == "outdoor":
        wetness = "dry"
        explanations.append("outdoor override wetness → dry")

    if function == "sanitary_space" and scores["function"]["cooking_space"] > 0.5:
        function = "service_space"
        explanations.append("conflict sanitary+cooking → service_space")

    # -----------------------------------------------------
    # 7️⃣ CONFIDENCE SCORE
    # -----------------------------------------------------
    confidence = round(
        scores["zone"].get(zone, 0) +
        scores["function"].get(function, 0),
        2
    )

    # -----------------------------------------------------
    # 8️⃣ BIM EXPORT
    # -----------------------------------------------------
    bim_type = BIM_MAP.get(function, "IfcSpace.Undefined")

    return {
        "room_type": function,
        "zone": zone,
        "primary_function": function,
        "wetness": wetness,
        "confidence_score": confidence,
        "bim_type": bim_type,
        "explanations": explanations,
        "raw_scores": {
            "zone": dict(scores["zone"]),
            "function": dict(scores["function"]),
            "wetness": dict(scores["wetness"])
        }
    }


# =========================================================
# 4️⃣ MULTI-ROOM CLASSIFIER (BUILDING LEVEL)
# =========================================================

def classify_building(rooms: List[Dict]) -> List[Dict]:
    results = []

    for room in rooms:
        result = classify_rooms(
            room_name=room.get("name", ""),
            detected_objects=room.get("objects", []),
            area_m2=room.get("area_m2"),
            outside_contact_ratio=room.get("outside_ratio"),
            adjacent_functions=room.get("adjacent_functions", [])
        )
        results.append(result)

    return results


# =========================================================
# 5️⃣ DEMO
# =========================================================

if __name__ == "__main__":

    test_rooms = [
        {
            "name": "Master Bedroom",
            "objects": [{"class": "bed"}],
            "area_m2": 15,
            "outside_ratio": 0.1
        },
        {
            "name": "Bathroom",
            "objects": [{"class": "toilet"}, {"class": "sink"}],
            "area_m2": 4,
            "outside_ratio": 0.0
        },
        {
            "name": "Deck",
            "objects": [],
            "area_m2": 10,
            "outside_ratio": 0.9
        }
    ]

    results = classify_building(test_rooms)

    from pprint import pprint
    pprint(results)

    