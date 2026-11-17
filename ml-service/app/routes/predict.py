from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from app.services.classifier import (
    classify_complaint,
    predict_priority,
    DEPARTMENT_BY_CATEGORY,
    haversine_meters,
    jaccard_similarity,
)

router = APIRouter(prefix="/predict", tags=["ML Predictions"])


class ComplaintInput(BaseModel):
    title: str
    description: str
    category: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ExistingComplaint(BaseModel):
    id: str
    title: str
    description: str
    category: str
    status: str
    latitude: float
    longitude: float
    createdAt: str


class DuplicateRequest(BaseModel):
    title: str
    description: str
    category: str
    latitude: float
    longitude: float
    existingComplaints: List[ExistingComplaint] = []


@router.post("/classify")
def classify_endpoint(payload: ComplaintInput):
    cat, matches, explanation = classify_complaint(payload.title, payload.description, payload.category)
    return {
        "predictedCategory": cat,
        "matchedKeywords": matches,
        "explanation": explanation,
        "modelSource": "python-fastapi-ml-service",
    }


@router.post("/priority")
def priority_endpoint(payload: ComplaintInput):
    cat, _, _ = classify_complaint(payload.title, payload.description, payload.category)
    priority, explanation = predict_priority(payload.title, payload.description, cat)
    return {
        "predictedPriority": priority,
        "explanation": explanation,
        "modelSource": "python-fastapi-ml-service",
    }


@router.post("/route")
def route_endpoint(payload: ComplaintInput):
    cat, _, _ = classify_complaint(payload.title, payload.description, payload.category)
    dept_id, dept_name = DEPARTMENT_BY_CATEGORY.get(cat, ("dept_general", "General Municipal Grievance Cell"))
    return {
        "recommendedDepartmentId": dept_id,
        "recommendedDepartmentName": dept_name,
        "category": cat,
        "modelSource": "python-fastapi-ml-service",
    }


@router.post("/duplicate-check")
def duplicate_check_endpoint(payload: DuplicateRequest):
    candidates = []
    source_text = f"{payload.title} {payload.description}"
    for item in payload.existingComplaints:
        dist = haversine_meters(payload.latitude, payload.longitude, item.latitude, item.longitude)
        sim = jaccard_similarity(source_text, f"{item.title} {item.description}")
        same_category = item.category == payload.category
        if (dist <= 350 and same_category) or (dist <= 600 and sim >= 0.28) or sim >= 0.45:
            candidates.append({
                "complaintId": item.id,
                "title": item.title,
                "category": item.category,
                "status": item.status,
                "distanceMeters": round(dist),
                "textSimilarityScore": round(sim, 2),
                "reason": f"{round(dist)}m away · {item.category} · lexical overlap {round(sim * 100)}%",
                "createdAt": item.createdAt,
            })
    return {"candidates": candidates[:5], "modelSource": "python-fastapi-ml-service"}


@router.post("/analyze")
def analyze_endpoint(payload: ComplaintInput):
    cat, matches, cat_exp = classify_complaint(payload.title, payload.description, payload.category)
    priority, pri_exp = predict_priority(payload.title, payload.description, cat)
    dept_id, dept_name = DEPARTMENT_BY_CATEGORY.get(cat, ("dept_general", "General Municipal Grievance Cell"))
    return {
        "predictedCategory": cat,
        "predictedPriority": priority,
        "recommendedDepartmentId": dept_id,
        "recommendedDepartmentName": dept_name,
        "matchedKeywords": matches,
        "explanation": f"{cat_exp} {pri_exp}",
        "modelSource": "python-fastapi-ml-service",
        "modelLabel": "Python FastAPI ML Service",
    }
