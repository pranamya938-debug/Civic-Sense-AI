import { Router } from 'express';
import {
  AuthenticatedRequest,
  loadRoleScopedCollectionDocs,
  requireAuth,
  requireRole,
} from '../middleware/authMiddleware.ts';
import { firestoreListCollection } from '../services/firestoreRestService.ts';
import {
  AnalyticsSourceItem,
  MUNICIPAL_DEPARTMENTS,
  MUNICIPAL_WARDS,
  computeAnalyticsOverview,
} from '../../shared/catalog.ts';
import { Department, UserProfile, Ward } from '../../shared/types.ts';

export const analyticsRoutes = Router();

function filterItems(
  list: AnalyticsSourceItem[],
  query: Record<string, string>
): AnalyticsSourceItem[] {
  let out = [...list];
  if (query.category && query.category !== 'All') {
    out = out.filter((c) => c.category === query.category);
  }
  if (query.wardId && query.wardId !== 'All') {
    out = out.filter((c) => c.wardId === query.wardId);
  }
  if (query.from) {
    const fromTime = new Date(query.from).getTime();
    if (!Number.isNaN(fromTime)) {
      out = out.filter((c) => new Date(c.createdAt).getTime() >= fromTime);
    }
  }
  if (query.to) {
    const toTime = new Date(query.to).getTime() + 86400 * 1000;
    if (!Number.isNaN(toTime)) {
      out = out.filter((c) => new Date(c.createdAt).getTime() <= toTime);
    }
  }
  return out;
}

async function loadAnalyticsSources(user: UserProfile, idToken: string) {
  const [markers, fsDepts, fsWards] = await Promise.all([
    loadRoleScopedCollectionDocs<AnalyticsSourceItem>('gis_markers', user, idToken, 500),
    firestoreListCollection<Department>('departments', idToken, 100, {
      field: 'active',
      op: 'EQUAL',
      value: true,
    }),
    firestoreListCollection<Ward>('wards', idToken, 100, {
      field: 'active',
      op: 'EQUAL',
      value: true,
    }),
  ]);
  const departments = fsDepts.length > 0 ? fsDepts : MUNICIPAL_DEPARTMENTS;
  const wards = fsWards.length > 0 ? fsWards : MUNICIPAL_WARDS;
  return { markers, departments, wards };
}

analyticsRoutes.get(
  '/overview',
  requireAuth,
  requireRole('authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { markers, departments, wards } = await loadAnalyticsSources(
        req.user!,
        req.firebaseIdToken!
      );
      const filtered = filterItems(markers, req.query as Record<string, string>);
      res.json(computeAnalyticsOverview(filtered, departments, wards));
    } catch (err) {
      next(err);
    }
  }
);

analyticsRoutes.get(
  '/categories',
  requireAuth,
  requireRole('authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { markers, departments, wards } = await loadAnalyticsSources(
        req.user!,
        req.firebaseIdToken!
      );
      const filtered = filterItems(markers, req.query as Record<string, string>);
      const overview = computeAnalyticsOverview(filtered, departments, wards);
      res.json({ byCategory: overview.byCategory });
    } catch (err) {
      next(err);
    }
  }
);

analyticsRoutes.get(
  '/wards',
  requireAuth,
  requireRole('authority', 'admin'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { markers, departments, wards } = await loadAnalyticsSources(
        req.user!,
        req.firebaseIdToken!
      );
      const filtered = filterItems(markers, req.query as Record<string, string>);
      const overview = computeAnalyticsOverview(filtered, departments, wards);
      res.json({ byWard: overview.byWard });
    } catch (err) {
      next(err);
    }
  }
);
