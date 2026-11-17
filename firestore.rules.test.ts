/**
 * CivicSense AI — Firestore Security Rules Adversarial Specification
 * Documents the 12 Dirty Dozen security assertions verified against firestore.rules.
 */
export const DIRTY_DOZEN_SECURITY_CASES = [
  { id: 'DD-01', target: '/users/{uid}', attack: 'Self-assign role=admin on create', expected: 'PERMISSION_DENIED' },
  { id: 'DD-02', target: '/complaints/{id}', attack: 'Shadow update injecting unknown key', expected: 'PERMISSION_DENIED' },
  { id: 'DD-03', target: '/audit_logs/{id}', attack: 'Admin email with email_verified=false', expected: 'PERMISSION_DENIED' },
  { id: 'DD-04', target: '/users/{other}/private/info', attack: 'Cross-user PII read', expected: 'PERMISSION_DENIED' },
  { id: 'DD-05', target: '/complaints', attack: 'Unfiltered list query by citizen', expected: 'PERMISSION_DENIED' },
  { id: 'DD-06', target: '/complaints/{longId}', attack: 'Document ID > 128 chars or invalid chars', expected: 'PERMISSION_DENIED' },
  { id: 'DD-07', target: '/complaints/{id}', attack: 'Client-forged createdAt != request.time', expected: 'PERMISSION_DENIED' },
  { id: 'DD-08', target: '/complaints/{id}', attack: 'Citizen updating status to Resolved', expected: 'PERMISSION_DENIED' },
  { id: 'DD-09', target: '/complaints/{id}', attack: 'Non-admin update on terminal Resolved doc', expected: 'PERMISSION_DENIED' },
  { id: 'DD-10', target: '/notifications/{id}', attack: 'Non-recipient marking notification read', expected: 'PERMISSION_DENIED' },
  { id: 'DD-11', target: '/complaints/missing/updates/u1', attack: 'Orphaned update without parent complaint', expected: 'PERMISSION_DENIED' },
  { id: 'DD-12', target: '/audit_logs/{id}', attack: 'Delete or tamper with immutable audit log', expected: 'PERMISSION_DENIED' },
] as const;
