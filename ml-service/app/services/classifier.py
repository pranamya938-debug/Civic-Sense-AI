from dataclasses import dataclass
from typing import List, Tuple
import math
import re


CATEGORIES = [
    "Garbage and Waste Management",
    "Road Damage and Potholes",
    "Water Supply and Leakage",
    "Drainage and Sewage",
    "Streetlight Problems",
    "Sanitation",
    "Public Infrastructure",
    "Other Civic Issues",
]

CATEGORY_KEYWORDS = {
    "Garbage and Waste Management": [
        "garbage", "trash", "waste", "dumping", "litter", "bin", "dustbin",
        "compactor", "plastic", "debris", "rubbish", "collection", "overflowing",
    ],
    "Road Damage and Potholes": [
        "pothole", "road", "asphalt", "crater", "pavement", "footpath", "sidewalk",
        "crack", "tar", "speedbreaker", "divider", "carriageway", "manhole cover",
    ],
    "Water Supply and Leakage": [
        "water", "leak", "leakage", "pipe", "pipeline", "burst", "supply",
        "tap", "contamination", "pressure", "valve", "drinking",
    ],
    "Drainage and Sewage": [
        "drain", "drainage", "sewage", "sewer", "gutter", "culvert", "flooding",
        "waterlogging", "overflow", "stormwater", "clogged", "blocked drain",
    ],
    "Streetlight Problems": [
        "streetlight", "light", "lamp", "pole", "dark", "flickering", "bulb",
        "led", "wiring", "blackout", "unlit",
    ],
    "Sanitation": [
        "sanitation", "toilet", "urinal", "hygiene", "stench", "foul smell",
        "mosquito", "sweeping", "cleaning", "disinfection",
    ],
    "Public Infrastructure": [
        "park", "bench", "bus stop", "shelter", "bridge", "railing", "signboard",
        "public building", "wall", "fence", "playground", "civic center",
    ],
}

DEPARTMENT_BY_CATEGORY = {
    "Garbage and Waste Management": ("dept_swm", "Solid Waste Management"),
    "Road Damage and Potholes": ("dept_roads", "Roads & Public Works"),
    "Water Supply and Leakage": ("dept_water", "Water Supply Board"),
    "Drainage and Sewage": ("dept_drainage", "Stormwater & Sewerage"),
    "Streetlight Problems": ("dept_elec", "Street Lighting & Electrical"),
    "Sanitation": ("dept_sanitation", "Public Health & Sanitation"),
    "Public Infrastructure": ("dept_infra", "Civic Infrastructure & Parks"),
    "Other Civic Issues": ("dept_general", "General Municipal Grievance Cell"),
}

CRITICAL_TERMS = [
    "live wire", "electrocution", "collapsed", "sinkhole", "hospital",
    "school gate", "raw sewage", "drinking water contamination", "flooding",
    "major burst", "accident", "toxic", "emergency", "fire hazard",
]

HIGH_TERMS = [
    "overflowing", "blocked", "broken", "dark street", "deep pothole",
    "leakage", "days", "main road", "highway", "junction", "foul smell",
]

LOW_TERMS = [
    "minor", "paint", "faded", "trimming", "small crack", "cosmetic",
]


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def classify_complaint(title: str, description: str, user_category: str | None = None) -> Tuple[str, List[str], str]:
    combined = f"{title} {description}".lower()
    best_cat = "Other Civic Issues"
    best_matches: List[str] = []

    for cat, keywords in CATEGORY_KEYWORDS.items():
        matches = [kw for kw in keywords if kw in combined]
        if len(matches) > len(best_matches):
            best_matches = matches
            best_cat = cat

    if not best_matches and user_category in CATEGORIES:
        best_cat = user_category
        explanation = f"Retained citizen-selected category '{best_cat}' because no distinct domain keywords matched."
    elif best_matches:
        explanation = f"Matched domain keywords ({', '.join(best_matches[:4])}) pointing to {best_cat}."
    else:
        explanation = "Assigned to Other Civic Issues pending manual officer triage."

    return best_cat, best_matches, explanation


def predict_priority(title: str, description: str, category: str) -> Tuple[str, str]:
    combined = f"{title} {description}".lower()
    crit_hits = [t for t in CRITICAL_TERMS if t in combined]
    if crit_hits:
        return "Critical", f"Flagged Critical due to high-hazard terms: {', '.join(crit_hits[:3])}."

    high_hits = [t for t in HIGH_TERMS if t in combined]
    if high_hits or category in ("Water Supply and Leakage", "Drainage and Sewage"):
        reason = f"Elevated to High priority ({', '.join(high_hits[:3])})" if high_hits else f"Elevated to High priority due to essential utility category ({category})."
        return "High", reason

    low_hits = [t for t in LOW_TERMS if t in combined]
    if low_hits:
        return "Low", f"Estimated Low priority based on minor maintenance indicators ({', '.join(low_hits[:2])})."

    return "Medium", "Assigned standard Medium operational priority."


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def jaccard_similarity(a: str, b: str) -> float:
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)
