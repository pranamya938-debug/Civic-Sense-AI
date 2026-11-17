# CivicSense AI — Database Schema

The platform defines canonical entities in `firebase-blueprint.json` and enforces access control in `firestore.rules`.

## Collections

1. **`/users/{userId}`** — User role metadata (`uid`, `displayName`, `role`, `departmentId`, `wardId`, `active`, `createdAt`, `updatedAt`).
2. **`/users/{userId}/private/info`** — Strictly owner/admin-isolated PII (`uid`, `email`, `phone`, `homeAddress`, `updatedAt`).
3. **`/admins/{userId}`** — Verified administrator registry (`uid`, `email`, `grantedBy`, `createdAt`).
4. **`/departments/{departmentId}`** — Municipal departments (`id`, `name`, `code`, `categories`, `leadOfficer`, `active`, `createdAt`).
5. **`/wards/{wardId}`** — Spatial ward centers (`id`, `name`, `zone`, `centerLat`, `centerLng`, `isDemoBoundary`, `active`, `createdAt`).
6. **`/complaints/{complaintId}`** — Civic grievances (`id`, `citizenId`, `citizenName`, `title`, `description`, `category`, `priority`, `status`, `photoUrl`, `latitude`, `longitude`, `address`, `wardId`, `assignedDepartmentId`, `assignedAuthorityId`, `resolutionNotes`, `aiSource`, `aiExplanation`, `createdAt`, `updatedAt`).
7. **`/complaints/{complaintId}/updates/{updateId}`** — Immutable status history and officer remarks (`id`, `complaintId`, `complaintCitizenId`, `actorId`, `actorName`, `actorRole`, `previousStatus`, `newStatus`, `remarks`, `createdAt`).
8. **`/duplicate_matches/{matchId}`** — Flagged potential duplicates for authority/admin review (`id`, `sourceComplaintId`, `matchedComplaintId`, `similarityReason`, `reviewStatus`, `reviewedBy`, `createdAt`).
9. **`/notifications/{notificationId}`** — Recipient-scoped alerts (`id`, `recipientId`, `complaintId`, `title`, `message`, `read`, `createdAt`).
10. **`/audit_logs/{logId}`** — Immutable administrative activity trail (`id`, `actorId`, `actorRole`, `action`, `targetType`, `targetId`, `details`, `createdAt`).
