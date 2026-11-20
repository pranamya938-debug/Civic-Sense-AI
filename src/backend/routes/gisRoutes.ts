import { Router } from 'express';
import {
  AuthenticatedRequest,
  loadRoleScopedCollectionDocs,
  requireAuth,
  requireRole,
} from '../middleware/authMiddleware.ts';
import { firestoreListCollection } from '../services/firestoreRestService.ts';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../../shared/catalog.ts';
import { Department, Ward } from '../../shared/types.ts';

export const gisRoutes = Router();

gisRoutes.get(
  '/complaints',
  requireAuth,
  requireRole('authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const token = req.firebaseIdToken!;
      const { category, priority, wardId, status } = req.query as Record<string, string>;
      let markers = await loadRoleScopedCollectionDocs<Record<string, unknown>>(
        'gis_markers',
        req.user!,
        token,
        500
      );

      if (category && category !== 'All') markers = markers.filter((c) => c.category === category);
      if (priority && priority !== 'All') markers = markers.filter((c) => c.priority === priority);
      if (wardId && wardId !== 'All') markers = markers.filter((c) => c.wardId === wardId);
      if (status && status !== 'All') markers = markers.filter((c) => c.status === status);

      res.json({
        complaints: markers,
        geoJsonNotice:
          req.user!.role === 'authority'
            ? 'Displaying WGS84 markers scoped to your authorized department or ward.'
            : 'Coordinates are real WGS84 points stored in Cloud Firestore.',
      });
    } catch (err) {
      next(err);
    }
  }
);

gisRoutes.get('/wards', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = req.firebaseIdToken!;
    const [fsWards, fsDepts] = await Promise.all([
      firestoreListCollection<Ward>('wards', token, 100, {
        field: 'active',
        op: 'EQUAL',
        value: true,
      }),
      firestoreListCollection<Department>('departments', token, 100, {
        field: 'active',
        op: 'EQUAL',
        value: true,
      }),
    ]);
    const wards = fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS;
    const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;

    res.json({
      wards,
      departments,
      isDemoBoundaryDataset: true,
      notice:
        'Displaying live Cloud Firestore ward metadata (with municipal reference boundaries).',
    });
  } catch (err) {
    next(err);
  }
});
