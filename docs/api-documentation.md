# CivicSense AI — REST API Documentation

Base URL: `http://localhost:3000`

## Authentication

Protected endpoints require `Authorization: Bearer <firebase_id_token>` issued by Firebase Authentication (`firebase-applet-config.json`). No custom JWT secrets or plaintext/local password hashes are used.

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Server, Cloud Firestore, Firebase Auth, and ML configuration health |
| `GET` | `/api/auth/me` | Required | Verify Firebase ID token and return Firestore user profile & role |
| `POST` | `/api/auth/logout` | Public | Sign-out acknowledgement |

## Complaints & Uploads

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/uploads` | Required | Validate & store citizen evidence photo (JPEG/PNG/WEBP <= 2MB) in `/uploads/` |
| `POST` | `/api/complaints` | Required | Submit grievance to Cloud Firestore with AI triage + duplicate check |
| `GET` | `/api/complaints` | Required | List Cloud Firestore grievances (citizen-scoped for citizens) |
| `GET` | `/api/complaints/:id` | Required | Fetch complaint details and timeline updates from Cloud Firestore |
| `PATCH` | `/api/complaints/:id/status` | Authority / Admin | Update status, priority, remarks, resolution notes + citizen notification |
| `PATCH` | `/api/complaints/:id/assign` | Authority / Admin | Assign department and field officer |

## AI / ML Endpoints

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/ai/status` | Public | Report active classifier (`python-fastapi-ml-service` vs `demonstration-baseline-classifier`) + limitation notice |
| `POST` | `/api/ai/analyze` | Public | Combined classification, priority, routing & spatial duplicate check against Firestore `/gis_markers` |
| `POST` | `/api/ai/classify` | Public | Classify complaint category with keyword explanation |
| `POST` | `/api/ai/priority` | Public | Predict priority (`Low`, `Medium`, `High`, `Critical`) |
| `POST` | `/api/ai/duplicate-check` | Public | Haversine distance + lexical similarity scan against Cloud Firestore markers |
| `POST` | `/api/ai/route` | Public | Recommend responsible municipal department |

## GIS, Analytics, Notifications, Admin & Export

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/gis/complaints` | Public | Sanitized WGS84 complaint pins from Cloud Firestore with filters |
| `GET` | `/api/gis/wards` | Public | Municipal ward centers and department metadata from Cloud Firestore |
| `GET` | `/api/analytics/overview` | Public | Live metrics, trends, ward & department performance from Cloud Firestore |
| `GET` | `/api/notifications` | Required | Recipient Cloud Firestore notifications, unread count, and optional gateway status |
| `PATCH` | `/api/notifications/:id/read` | Required | Mark notification read |
| `PATCH` | `/api/notifications/read-all` | Required | Mark all user notifications read |
| `GET` | `/api/admin/users` | Authority / Admin | List Cloud Firestore user profiles |
| `PATCH` | `/api/admin/users/:uid` | Admin | Update user role or active state + immutable audit log |
| `POST` | `/api/admin/departments` | Admin | Create municipal department |
| `POST` | `/api/admin/wards` | Admin | Create municipal ward |
| `PATCH` | `/api/admin/duplicates/:id` | Authority / Admin | Confirm or dismiss flagged duplicate pairs |
| `GET` | `/api/admin/audit-logs` | Admin | Read immutable administrative audit log |
| `GET` | `/api/export/zip` | Public | Download `CivicSense_AI_Complete_Project.zip` |
