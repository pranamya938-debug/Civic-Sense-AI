from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.predict import router as predict_router

app = FastAPI(
    title="CivicSense AI — ML Microservice",
    description="Python FastAPI service for civic complaint classification, priority prediction, duplicate detection, and department routing.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "civicsense-ml-service"}
