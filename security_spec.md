# CivicSense AI — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Identity Integrity**: A `User` document at `/users/{userId}` can only be created when `uid == request.auth.uid`, and non-admin self-registration MUST enforce `role == 'citizen'`.
2. **PII Isolation**: Email, phone, and residential address reside in `/users/{userId}/private/info` and are strictly readable/writable only by `isOwner(userId)` or `isAdmin()`.
3. **Complaint Ownership & Immutability**: A `Complaint` at `/complaints/{complaintId}` must have `citizenId == request.auth.uid` on creation, `createdAt == request.time`, and initial `status == 'Submitted'`. Fields `id`, `citizenId`, and `createdAt` are immutable after creation.
4. **Master Gate for Subcollections**: Creating or reading `/complaints/{complaintId}/updates/{updateId}` requires checking the parent `/complaints/{complaintId}` document via `get()` on single-doc operations, ensuring only the owning citizen (with verified identity), assigned authority, or admin can view or append timeline updates.
5. **Terminal State Locking**: Once a complaint reaches `Resolved` or `Rejected`, non-admin users cannot modify its `status`, `priority`, or `assignedDepartmentId`.
6. **Recipient-Scoped Notifications**: Users can only read and mark `read: true` on notifications where `resource.data.recipientId == request.auth.uid`.
7. **Admin-Only Audit Logs & Duplicate Decisions**: Only `isAdmin()` or `isAuthority()` can review `duplicate_matches`, and `audit_logs` can never be mutated or deleted once written.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)

1. **Role Escalation on Registration**: Citizen attempts `setDoc('/users/u1', { uid: 'u1', displayName: 'Attacker', role: 'admin', active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })`.
2. **Ghost Field / Shadow Update**: Citizen attempts `updateDoc('/complaints/c1', { title: 'Updated', isVerifiedByMayor: true, updatedAt: serverTimestamp() })`.
3. **Unverified Admin Email Spoof**: User with `email: '4al24cd025@aiet.org.in'` and `email_verified: false` attempts admin read of `/audit_logs/log1`.
4. **Cross-User PII Scrape**: Authenticated User A attempts `getDoc('/users/userB/private/info')`.
5. **Blanket List Query Scrape**: Authenticated User A attempts `getDocs(collection(db, 'complaints'))` without a `where('citizenId', '==', uid)` filter.
6. **ID Poisoning Attack**: User attempts to create `/complaints/${'A'.repeat(512)}` exceeding 128 chars or containing invalid characters (`../admin`).
7. **Client-Forged Timestamp**: User creates complaint with `createdAt: new Date('2020-01-01')` instead of `request.time`.
8. **Citizen Self-Resolving / Status Shortcut**: Citizen attempts `updateDoc('/complaints/c1', { status: 'Resolved', updatedAt: serverTimestamp() })`.
9. **Terminal State Tampering**: Authority attempts to reopen a `Resolved` complaint without admin override.
10. **Cross-Tenant Notification Hijack**: User A attempts `updateDoc('/notifications/n_for_userB', { read: true })`.
11. **Orphaned Subcollection Write**: User attempts to write `/complaints/nonexistent_id/updates/u1`.
12. **Audit Log Erasure**: Authority or Citizen attempts `deleteDoc('/audit_logs/log1')`.
