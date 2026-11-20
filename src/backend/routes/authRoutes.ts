import { Router } from 'express';
import {
  AuthenticatedRequest,
  isDeveloperAuthorized,
  resolveAuthUser,
} from '../middleware/authMiddleware.ts';
import { firestoreGetDoc } from '../services/firestoreRestService.ts';
import { AuthorityApplication } from '../../shared/types.ts';

export const authRoutes = Router();

authRoutes.get('/me', async (req: AuthenticatedRequest, res) => {
  const user = await resolveAuthUser(req);
  if (!user) {
    res.status(req.authFailureStatus || 401).json({
      error: req.authFailureReason || 'Not authenticated via Firebase Auth.',
    });
    return;
  }
  const authorityApplication =
    user.role !== 'admin' && user.role !== 'system' && req.firebaseIdToken
      ? await firestoreGetDoc<AuthorityApplication>(
          `authority_applications/${user.uid}`,
          req.firebaseIdToken
        ).catch(() => null)
      : null;

  const developerAccess = isDeveloperAuthorized(user, req.emailVerified);
  res.json({
    user,
    authorityApplication,
    capabilities: {
      developerConsole: developerAccess,
      sourceExport: developerAccess,
    },
  });
});

authRoutes.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Signed out cleanly.' });
});
