import fs from 'fs';
import path from 'path';
import { ApiError } from '../middleware/errorMiddleware.ts';

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
  apiKey?: string;
}

let cachedConfig: FirebaseAppletConfig | null = null;

function getFirebaseConfig(): FirebaseAppletConfig {
  if (cachedConfig) return cachedConfig;
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as FirebaseAppletConfig;
  cachedConfig = raw;
  return raw;
}

function getBaseUrl(): string {
  const cfg = getFirebaseConfig();
  const dbId = cfg.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${dbId}/documents`;
}

function getDatabaseRoot(): string {
  const cfg = getFirebaseConfig();
  const dbId = cfg.firestoreDatabaseId || '(default)';
  return `projects/${cfg.projectId}/databases/${dbId}/documents`;
}

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreQueryFilter {
  field: string;
  op?: 'EQUAL' | 'IN';
  value: string | boolean | number | Array<string | number>;
}

export function decodeFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((v) => decodeFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

export function encodeFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => encodeFirestoreValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function decodeDocument<T = Record<string, unknown>>(doc: {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}): T | null {
  if (!doc || !doc.fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  if (!out.id && doc.name) {
    const parts = doc.name.split('/');
    out.id = parts[parts.length - 1];
  }
  return out as T;
}

export async function firestoreGetDoc<T = Record<string, unknown>>(
  docPath: string,
  idToken: string
): Promise<T | null> {
  if (!idToken) {
    throw new ApiError(401, `Authenticated Firebase ID token is required to read ${docPath}.`);
  }
  const res = await fetch(`${getBaseUrl()}/${docPath}`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, `Firestore GET ${docPath} failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as { name?: string; fields?: Record<string, FirestoreValue> };
  return decodeDocument<T>(json);
}

export async function firestoreListCollection<T = Record<string, unknown>>(
  collectionPath: string,
  idToken: string,
  pageSize = 200,
  filter?: FirestoreQueryFilter
): Promise<T[]> {
  if (!idToken) {
    throw new ApiError(
      401,
      `Authenticated Firebase ID token is required to query ${collectionPath}.`
    );
  }

  const parts = collectionPath.split('/').filter(Boolean);
  const collectionId = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('/');
  const queryUrl = parentPath ? `${getBaseUrl()}/${parentPath}:runQuery` : `${getBaseUrl()}:runQuery`;

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
    limit: pageSize,
  };

  if (filter) {
    const op = filter.op || 'EQUAL';
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: filter.field },
        op,
        value: encodeFirestoreValue(filter.value),
      },
    };
  }

  const res = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    const body = await res.text();
    throw new ApiError(res.status, `Firestore LIST ${collectionPath} failed (${res.status}): ${body}`);
  }

  const rows = (await res.json()) as Array<{
    document?: { name?: string; fields?: Record<string, FirestoreValue> };
  }>;
  return rows
    .map((r) => (r.document ? decodeDocument<T>(r.document) : null))
    .filter(Boolean) as T[];
}

export interface BatchWriteOp {
  docPath: string;
  data?: Record<string, unknown>;
  serverTimestamps?: string[];
  updateMask?: string[];
  deleteDoc?: boolean;
}

export async function firestoreCommitBatch(ops: BatchWriteOp[], idToken: string): Promise<void> {
  if (!idToken) {
    throw new ApiError(401, 'Authenticated Firebase ID token is required for Firestore writes.');
  }
  const root = getDatabaseRoot();
  const writes = ops.map((op) => {
    const fullName = `${root}/${op.docPath}`;
    if (op.deleteDoc) {
      return { delete: fullName };
    }
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(op.data || {})) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
      }
    }
    const fieldTransforms = (op.serverTimestamps || []).map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));

    const write: Record<string, unknown> = {
      update: {
        name: fullName,
        fields,
      },
    };
    if (op.updateMask && op.updateMask.length > 0) {
      write.updateMask = { fieldPaths: op.updateMask };
    }
    if (fieldTransforms.length > 0) {
      write.updateTransforms = fieldTransforms;
    }
    return write;
  });

  const res = await fetch(`${getBaseUrl()}:commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, `Firestore commit failed (${res.status}): ${body}`);
  }
}
