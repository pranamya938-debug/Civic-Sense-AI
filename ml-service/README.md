# CivicSense AI — Python FastAPI ML Service

This standalone microservice executes NLP complaint classification, priority prediction, department routing, and spatial-lexical duplicate detection.

## Local Setup

```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Connecting to Node.js Backend

Set `ML_SERVICE_URL=http://localhost:8000` in your root `.env` file and restart the Express backend.
When `ML_SERVICE_URL` is configured and healthy, predictions are tagged `python-fastapi-ml-service`.
When unavailable, the backend transparently uses the `demonstration-baseline-classifier`.
