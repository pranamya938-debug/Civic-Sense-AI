import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/authMiddleware.ts';
import {
  firestoreCommitBatch,
  firestoreGetDoc,
  firestoreListCollection,
} from '../services/firestoreRestService.ts';
import { notificationGateway } from '../services/notificationGateway.ts';
import { AppNotification } from '../../shared/types.ts';

export const notificationRoutes = Router();

notificationRoutes.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = req.firebaseIdToken!;
    const all = await firestoreListCollection<AppNotification>('notifications', token, 200, {
      field: 'recipientId',
      value: req.user!.uid,
    });
    const items = all
      .filter((n) => n.recipientId === req.user!.uid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadCount = items.filter((n) => !n.read).length;
    res.json({
      notifications: items,
      unreadCount,
      gatewayStatus: notificationGateway.getExternalGatewayStatus(),
    });
  } catch (err) {
    next(err);
  }
});

notificationRoutes.patch('/:id/read', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = req.firebaseIdToken!;
    const item = await firestoreGetDoc<AppNotification>(`notifications/${req.params.id}`, token);
    if (!item) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    if (item.recipientId !== req.user!.uid && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Cannot modify another user notification.' });
      return;
    }
    await firestoreCommitBatch(
      [
        {
          docPath: `notifications/${item.id}`,
          data: { read: true },
          updateMask: ['read'],
        },
      ],
      token
    );
    res.json({ notification: { ...item, read: true } });
  } catch (err) {
    next(err);
  }
});

notificationRoutes.patch('/read-all', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = req.firebaseIdToken!;
    const all = await firestoreListCollection<AppNotification>('notifications', token, 200, {
      field: 'recipientId',
      value: req.user!.uid,
    });
    const unread = all.filter((n) => n.recipientId === req.user!.uid && !n.read);
    if (unread.length > 0) {
      await firestoreCommitBatch(
        unread.map((n) => ({
          docPath: `notifications/${n.id}`,
          data: { read: true },
          updateMask: ['read'],
        })),
        token
      );
    }
    res.json({ updated: unread.length });
  } catch (err) {
    next(err);
  }
});
