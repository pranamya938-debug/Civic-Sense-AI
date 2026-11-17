import { Router } from 'express';
import { AuthenticatedRequest, resolveAuthUser } from '../middleware/authMiddleware.ts';

export const authRoutes = Router();

authRoutes.get('/me', async (req: AuthenticatedRequest, res) => {
  const user = await resolveAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated via Firebase Auth.' });
    return;
  }
  res.json({ user });
});

authRoutes.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Signed out cleanly.' });
});
