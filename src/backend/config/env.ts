import fs from 'fs';
import path from 'path';

let firebaseWebApiKey = '';
let firebaseProjectId = '';
let firestoreDatabaseId = '';
let firebaseAuthDomain = '';

try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    firebaseWebApiKey = raw.apiKey || '';
    firebaseProjectId = raw.projectId || '';
    firestoreDatabaseId = raw.firestoreDatabaseId || '';
    firebaseAuthDomain = raw.authDomain || '';
  }
} catch {
  firebaseWebApiKey = '';
}

function parseAllowlist(raw: string | undefined, defaults: string[] = []): string[] {
  const items = (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : defaults;
}

export const ENV = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  ML_SERVICE_URL: (process.env.ML_SERVICE_URL || '').replace(/\/$/, ''),
  FIREBASE_WEB_API_KEY: firebaseWebApiKey,
  FIREBASE_PROJECT_ID: firebaseProjectId,
  FIRESTORE_DATABASE_ID: firestoreDatabaseId,
  FIREBASE_AUTH_DOMAIN: firebaseAuthDomain,
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMS_WEBHOOK_URL: process.env.SMS_WEBHOOK_URL || '',
  DEVELOPER_ALLOWLIST_EMAILS: parseAllowlist(
    process.env.DEVELOPER_ALLOWLIST_EMAILS,
    ['4al24cd025@aiet.org.in']
  ).map((e) => e.toLowerCase()),
  DEVELOPER_ALLOWLIST_UIDS: parseAllowlist(process.env.DEVELOPER_ALLOWLIST_UIDS, []),
};
