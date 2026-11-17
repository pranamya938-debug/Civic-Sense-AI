# CivicSense AI — 100s of Complaints. One Platform.

**CivicSense AI** is a full-stack intelligent civic grievance management platform connecting citizens with municipal authorities using **Firebase Authentication**, **Cloud Firestore**, REST APIs, OpenStreetMap/Leaflet GIS mapping, and a Python FastAPI ML integration layer.

## Features

- **Cinematic Urban Landing & Role Portals**: Dedicated entry points for **Citizens**, **Municipal Authorities**, and **Administrators**.
- **Firebase Authentication**: Google Sign-In and Email/Password authentication with server-side Firebase ID token verification and Firestore RBAC role enforcement.
- **Persistent Cloud Firestore Database**: All citizen grievances, status timelines, municipal assignments, GIS map markers, notifications, duplicate reviews, and audit logs persist in Cloud Firestore (`firebase-applet-config.json`). No mock databases or in-memory substitutes are used.
- **Evidence Photo Upload**: Citizens upload JPEG/PNG/WEBP evidence photographs stored via `/api/uploads` and attached to complaint records.
- **AI/ML Triage Layer (Graceful Baseline Fallback)**: Configurable HTTP integration (`ML_SERVICE_URL`) with the included `ml-service/` Python FastAPI service. When disconnected, the platform clearly indicates that the **Baseline Rule-Based Classifier** is active.
- **Zero External Email/SMS Dependency**: In-app notifications persist directly in Cloud Firestore without requiring SMTP or SMS credentials.
- **GIS Spatial Intelligence**: Leaflet + OpenStreetMap interactive map displaying live Cloud Firestore complaint coordinates with category, priority, and ward filters.
- **Admin Control Center**: User role management, department & ward configuration, duplicate queue review, live analytics, audit logs, and developer API docs / ZIP source export.

## Quick Start (Full-Stack Node + React)

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Running the Python FastAPI ML Service (Optional)

```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Set `ML_SERVICE_URL=http://localhost:8000` in `.env` and restart the server.

## Environment Variables

See `.env.example` for complete details:

- **Runtime**: `PORT` (default `3000`), `NODE_ENV` (`development` | `production`), `APP_URL`
- **Firebase Config**: Loaded from `firebase-applet-config.json` (`apiKey`, `authDomain`, `projectId`, `firestoreDatabaseId`, `appId`)
- **Optional (Not Required to Run)**: `ML_SERVICE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMS_WEBHOOK_URL`
- **Unnecessary with Firebase Auth**: `JWT_SECRET`, `AUTH_SECRET`, `SESSION_SECRET`, `DEMO_MODE`, `DATABASE_URL`, `GEMINI_API_KEY`

Never commit secrets or service-account private keys.

## Documentation

- `docs/architecture.md`
- `docs/api-documentation.md`
- `docs/database-schema.md`
- `ml-service/README.md`
