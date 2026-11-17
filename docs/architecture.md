# CivicSense AI — System Architecture

## Overview

CivicSense AI is a full-stack civic grievance management platform connecting citizens, municipal authorities, and administrators through AI-assisted triage, Cloud Firestore persistence, and interactive OpenStreetMap GIS intelligence.

## Layers

1. **Frontend (`src/`)**:
   - React 19 + TypeScript + Vite + Tailwind CSS v4.
   - Cinematic introductory street scene (`CinematicIntro.tsx`) with `Skip Intro` and `Reduced Motion` controls.
   - Dedicated portals for `Citizen`, `Municipal Authority`, and `Administrator` roles.
   - Interactive Leaflet + OpenStreetMap GIS explorer (`GisMap.tsx`, `GisExplorerPage.tsx`) supporting clustering, density overlays, and browser GPS coordinate capture.
   - Live SVG + tabular analytics dashboard (`AnalyticsCharts.tsx`, `AnalyticsPage.tsx`).

2. **Backend (`server.ts`, `src/backend/`)**:
   - Express REST API server listening on port `3000` (serving Vite middleware in development and `dist/` in production).
   - Server-side Firebase Authentication verification (`accounts:lookup` against `firebase-applet-config.json`) combined with Firestore RBAC role checks (`requireAuth`, `requireRole`).
   - Direct Cloud Firestore REST client (`firestoreRestService.ts`) using `:runQuery` and atomic `:commit` batches — zero fake databases, local JSON stores, or temporary in-memory substitutes.
   - Authenticated evidence photo upload handler (`POST /api/uploads` -> `/uploads/<filename>`).
   - Project archive exporter streaming `CivicSense_AI_Complete_Project.zip` via `GET /api/export/zip`.

3. **AI/ML Integration (`src/backend/services/mlService.ts` + `ml-service/`)**:
   - Configurable HTTP integration via `ML_SERVICE_URL` pointing to the standalone Python FastAPI service (`ml-service/`).
   - When `ML_SERVICE_URL` is unset or unreachable, the backend and UI transparently fall back to `baselineClassifier.ts` (`demonstration-baseline-classifier`) and display an explicit notice that the baseline heuristic classifier is active.

4. **Database & Security (`firebase-blueprint.json`, `firestore.rules`)**:
   - Cloud Firestore collections with PII isolation (`/users/{uid}/private/info`), strict schema validation helpers, server timestamp enforcement (`request.time`), and Master Gate subcollection protection.
   - In-app notifications persist in `/notifications` without requiring external SMTP or SMS providers.
