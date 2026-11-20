import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { ENV } from '../config/env.ts';
import {
  AuthenticatedRequest,
  requireAuth,
  requireDeveloperAccess,
} from '../middleware/authMiddleware.ts';
import { mlService } from '../services/mlService.ts';

export const developerRoutes = Router();

developerRoutes.use(requireAuth, requireDeveloperAccess);

developerRoutes.get('/status', (req: AuthenticatedRequest, res) => {
  res.json({
    authorized: true,
    account: {
      uid: req.user!.uid,
      displayName: req.user!.displayName,
      role: req.user!.role,
    },
    capabilities: {
      developerConsole: true,
      sourceExport: true,
    },
  });
});

developerRoutes.get('/diagnostics', async (req: AuthenticatedRequest, res, next) => {
  try {
    const mlHealth = await mlService.getHealth();
    const rootDir = process.cwd();
    const uploadsDir = path.resolve(rootDir, 'uploads');
    const uploadsDirExists = fs.existsSync(uploadsDir);
    const uploadCount = uploadsDirExists
      ? fs.readdirSync(uploadsDir).filter((name) => !name.startsWith('.')).length
      : 0;

    res.json({
      service: 'CivicSense AI Developer Console',
      generatedAt: new Date().toISOString(),
      authorizedActor: {
        uid: req.user!.uid,
        displayName: req.user!.displayName,
        role: req.user!.role,
      },
      runtime: {
        nodeEnv: ENV.NODE_ENV,
        nodeVersion: process.version,
        port: ENV.PORT,
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        platform: process.platform,
      },
      firebase: {
        configured: Boolean(
          ENV.FIREBASE_WEB_API_KEY &&
            ENV.FIREBASE_PROJECT_ID &&
            ENV.FIRESTORE_DATABASE_ID
        ),
        projectId: ENV.FIREBASE_PROJECT_ID || 'Not configured',
        firestoreDatabaseId: ENV.FIRESTORE_DATABASE_ID || '(default)',
        authDomain: ENV.FIREBASE_AUTH_DOMAIN || 'Not configured',
        rulesFilePresent: fs.existsSync(path.resolve(rootDir, 'firestore.rules')),
        blueprintPresent: fs.existsSync(path.resolve(rootDir, 'firebase-blueprint.json')),
      },
      mlService: {
        configured: Boolean(ENV.ML_SERVICE_URL),
        pythonServiceReachable: mlHealth.pythonServiceReachable,
        activeMode: mlHealth.activeMode,
        modelLabel: mlHealth.pythonServiceReachable
          ? 'Connected Python FastAPI ML Service'
          : 'Baseline Rule + Lexical Classifier (Fallback)',
      },
      notifications: {
        inAppFirestoreActive: true,
        smtpConfigured: Boolean(ENV.SMTP_HOST),
        smsConfigured: Boolean(ENV.SMS_WEBHOOK_URL),
      },
      storage: {
        uploadsDirExists,
        uploadCount,
      },
      sourceExport: {
        available: true,
        endpoint: '/api/export/zip',
        excludedPatterns: ['.env', '.env.local', 'node_modules', 'dist', 'uploads'],
      },
    });
  } catch (err) {
    next(err);
  }
});
