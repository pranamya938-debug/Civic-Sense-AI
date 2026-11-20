import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AuthenticatedRequest, requireAuth } from '../middleware/authMiddleware.ts';
import {
  firestoreCommitBatch,
  firestoreGetDoc,
  firestoreListCollection,
} from '../services/firestoreRestService.ts';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../../shared/catalog.ts';
import { AuthorityApplication, Department, Ward } from '../../shared/types.ts';

export const authorityApplicationRoutes = Router();

const PRIVATE_DOCS_DIR = path.resolve(process.cwd(), 'private_uploads', 'authority_docs');
const MAX_DOC_BYTES = 2 * 1024 * 1024; // 2 MB

const DOC_MIME_TO_EXT: Record<string, { ext: string; mime: string }> = {
  'image/jpeg': { ext: 'jpg', mime: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', mime: 'image/jpeg' },
  'image/png': { ext: 'png', mime: 'image/png' },
  'image/webp': { ext: 'webp', mime: 'image/webp' },
  'application/pdf': { ext: 'pdf', mime: 'application/pdf' },
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

authorityApplicationRoutes.post(
  '/documents',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { dataUrl, fileName } = req.body as { dataUrl?: string; fileName?: string };
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'Verification document dataUrl is required.' });
      return;
    }

    const match = dataUrl.match(
      /^data:(image\/(?:jpeg|jpg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/
    );
    if (!match) {
      res.status(400).json({
        error: 'Only PDF, JPEG, PNG, and WEBP employment verification documents are supported.',
      });
      return;
    }

    const mimeInfo = DOC_MIME_TO_EXT[match[1]];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_DOC_BYTES) {
      res.status(400).json({ error: 'Verification document must be under 2 MB.' });
      return;
    }

    if (!fs.existsSync(PRIVATE_DOCS_DIR)) {
      fs.mkdirSync(PRIVATE_DOCS_DIR, { recursive: true });
    }

    const safeUid = req.user!.uid.replace(/[^a-zA-Z0-9_-]/g, '');
    const storedName = `authdoc_${safeUid}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${mimeInfo.ext}`;
    const fullPath = path.join(PRIVATE_DOCS_DIR, storedName);
    fs.writeFileSync(fullPath, buffer);

    res.status(201).json({
      verificationDocUrl: `/api/authority-applications/documents/${storedName}`,
      verificationDocName: (fileName || storedName).trim().slice(0, 160),
      sizeBytes: buffer.byteLength,
    });
  }
);

authorityApplicationRoutes.get(
  '/documents/:filename',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const filename = req.params.filename;
      if (!/^[a-zA-Z0-9_.\-]+$/.test(filename)) {
        res.status(400).json({ error: 'Invalid document filename.' });
        return;
      }

      const safeUid = req.user!.uid.replace(/[^a-zA-Z0-9_-]/g, '');
      const isAdmin = req.user!.role === 'admin';
      const isOwnerByPrefix = filename.startsWith(`authdoc_${safeUid}_`);
      let isOwnerByRecord = false;
      if (!isAdmin && !isOwnerByPrefix) {
        const ownApp = await firestoreGetDoc<AuthorityApplication>(
          `authority_applications/${req.user!.uid}`,
          req.firebaseIdToken!
        ).catch(() => null);
        if (ownApp?.verificationDocUrl?.endsWith(`/${filename}`)) {
          isOwnerByRecord = true;
        }
      }

      if (!isAdmin && !isOwnerByPrefix && !isOwnerByRecord) {
        res.status(403).json({
          error: 'Access denied. Employment verification documents are private.',
        });
        return;
      }

      const fullPath = path.resolve(PRIVATE_DOCS_DIR, filename);
      if (!fullPath.startsWith(PRIVATE_DOCS_DIR) || !fs.existsSync(fullPath)) {
        res.status(404).json({ error: 'Verification document not found.' });
        return;
      }

      const ext = path.extname(filename).toLowerCase();
      res.setHeader('Content-Type', EXT_TO_MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.sendFile(fullPath);
    } catch (err) {
      next(err);
    }
  }
);

authorityApplicationRoutes.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const app = await firestoreGetDoc<AuthorityApplication>(
      `authority_applications/${req.user!.uid}`,
      req.firebaseIdToken!
    );
    res.json({
      application: app,
      emailVerified: Boolean(req.emailVerified),
    });
  } catch (err) {
    next(err);
  }
});

authorityApplicationRoutes.post(
  '/sync-email-verification',
  requireAuth,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const uid = req.user!.uid;
      const existing = await firestoreGetDoc<AuthorityApplication>(
        `authority_applications/${uid}`,
        token
      );
      if (!existing) {
        res.json({ application: null, emailVerified: Boolean(req.emailVerified) });
        return;
      }

      const verified = Boolean(req.emailVerified);
      if (existing.status === 'pending_verification' && existing.emailVerified !== verified) {
        await firestoreCommitBatch(
          [
            {
              docPath: `authority_applications/${uid}`,
              data: { emailVerified: verified },
              updateMask: ['emailVerified', 'updatedAt'],
              serverTimestamps: ['updatedAt'],
            },
          ],
          token
        );
      }

      const fresh = await firestoreGetDoc<AuthorityApplication>(
        `authority_applications/${uid}`,
        token
      );
      res.json({
        application: fresh,
        emailVerified: verified,
      });
    } catch (err) {
      next(err);
    }
  }
);

authorityApplicationRoutes.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = req.firebaseIdToken!;
    const uid = req.user!.uid;

    if (req.user!.role === 'admin' || req.user!.role === 'system') {
      res.status(400).json({
        error: 'Administrators and system accounts cannot submit authority access applications.',
      });
      return;
    }

    const {
      fullName,
      officialEmail,
      contactNumber,
      employeeId,
      designation,
      municipality,
      departmentId,
      wardId,
      verificationDocUrl,
      verificationDocName,
    } = req.body as {
      fullName?: string;
      officialEmail?: string;
      contactNumber?: string;
      employeeId?: string;
      designation?: string;
      municipality?: string;
      departmentId?: string;
      wardId?: string;
      verificationDocUrl?: string;
      verificationDocName?: string;
    };

    if (!fullName || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Full Name (minimum 2 characters) is required.' });
      return;
    }
    if (!officialEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(officialEmail.trim())) {
      res.status(400).json({ error: 'A valid Official Email Address is required.' });
      return;
    }
    if (!contactNumber || contactNumber.trim().length < 6) {
      res.status(400).json({ error: 'A valid Contact Number is required.' });
      return;
    }
    if (!employeeId || employeeId.trim().length < 2) {
      res.status(400).json({ error: 'Employee ID is required.' });
      return;
    }
    if (!designation || designation.trim().length < 2) {
      res.status(400).json({ error: 'Official Designation is required.' });
      return;
    }
    if (!municipality || municipality.trim().length < 2) {
      res.status(400).json({ error: 'Municipal Corporation / Municipality is required.' });
      return;
    }
    if (!departmentId || !wardId) {
      res.status(400).json({ error: 'Department and Assigned Ward are required.' });
      return;
    }
    if (
      verificationDocUrl &&
      !verificationDocUrl.startsWith('/api/authority-applications/documents/')
    ) {
      res.status(400).json({
        error: 'Upload supporting employment verification document via /api/authority-applications/documents.',
      });
      return;
    }

    const [existingApp, fsDepts, fsWards] = await Promise.all([
      firestoreGetDoc<AuthorityApplication>(`authority_applications/${uid}`, token),
      firestoreListCollection<Department>('departments', token, 100, {
        field: 'active',
        op: 'EQUAL',
        value: true,
      }),
      firestoreListCollection<Ward>('wards', token, 100, {
        field: 'active',
        op: 'EQUAL',
        value: true,
      }),
    ]);

    if (existingApp) {
      if (existingApp.status === 'pending_verification') {
        res.status(409).json({
          error: 'An authority access application is already pending review for this account.',
        });
        return;
      }
      if (existingApp.status === 'approved') {
        res.status(409).json({
          error: 'Your municipal authority access is already approved.',
        });
        return;
      }
      if (existingApp.status === 'suspended') {
        res.status(403).json({
          error: 'Your authority account is currently suspended. Please contact an administrator.',
        });
        return;
      }
    }

    const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;
    const wards = fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS;

    const dept = departments.find((d) => d.id === departmentId && d.active !== false);
    if (!dept) {
      res.status(400).json({ error: 'Selected municipal department does not exist in Firestore.' });
      return;
    }

    const ward = wards.find((w) => w.id === wardId && w.active !== false);
    if (!ward) {
      res.status(400).json({ error: 'Selected ward does not exist in Firestore.' });
      return;
    }

    const cleanName = fullName.trim().slice(0, 120);
    const cleanEmail = officialEmail.trim().slice(0, 180);
    const cleanContact = contactNumber.trim().slice(0, 32);
    const cleanEmpId = employeeId.trim().slice(0, 64);
    const cleanDesignation = designation.trim().slice(0, 120);
    const cleanMunicipality = municipality.trim().slice(0, 160);

    const appPayload: Record<string, unknown> = {
      id: uid,
      uid,
      fullName: cleanName,
      officialEmail: cleanEmail,
      contactNumber: cleanContact,
      employeeId: cleanEmpId,
      designation: cleanDesignation,
      municipality: cleanMunicipality,
      departmentId: dept.id,
      departmentName: dept.name.slice(0, 120),
      wardId: ward.id,
      wardName: ward.name.slice(0, 120),
      emailVerified: Boolean(req.emailVerified),
      status: 'pending_verification',
    };
    if (verificationDocUrl) {
      appPayload.verificationDocUrl = verificationDocUrl.slice(0, 500);
    }
    if (verificationDocName) {
      appPayload.verificationDocName = verificationDocName.trim().slice(0, 160);
    }

    const isResubmission = Boolean(existingApp && existingApp.status === 'rejected');
    if (isResubmission && existingApp?.submittedAt) {
      appPayload.submittedAt = existingApp.submittedAt;
    }

    const auditId = `audit_${Date.now()}`;
    await firestoreCommitBatch(
      [
        {
          docPath: `authority_applications/${uid}`,
          data: appPayload,
          timestampFields: isResubmission ? ['submittedAt'] : undefined,
          serverTimestamps: isResubmission ? ['updatedAt'] : ['submittedAt', 'updatedAt'],
        },
        {
          docPath: `users/${uid}`,
          data: {
            accountStatus: 'pending_verification',
            designation: cleanDesignation,
            municipality: cleanMunicipality,
            employeeId: cleanEmpId,
          },
          updateMask: [
            'accountStatus',
            'designation',
            'municipality',
            'employeeId',
            'updatedAt',
          ],
          serverTimestamps: ['updatedAt'],
        },
        {
          docPath: `audit_logs/${auditId}`,
          data: {
            id: auditId,
            actorId: uid,
            actorName: cleanName,
            actorRole: 'citizen',
            action: 'AUTHORITY_APPLICATION_SUBMITTED',
            targetType: 'authority_application',
            targetId: uid,
            details: `${isResubmission ? 'Resubmitted' : 'Submitted'} authority application for ${dept.name} / ${ward.name} (Emp ID: ${cleanEmpId}, ${cleanMunicipality})`.slice(0, 500),
          },
          serverTimestamps: ['createdAt'],
        },
      ],
      token
    );

    const saved = await firestoreGetDoc<AuthorityApplication>(
      `authority_applications/${uid}`,
      token
    );
    res.status(201).json({
      application: saved,
      emailVerified: Boolean(req.emailVerified),
    });
  } catch (err) {
    next(err);
  }
});
