import { Router } from 'express';
import { AuthenticatedRequest, requireAuth, resolveAuthUser } from '../middleware/authMiddleware.ts';
import { mlService } from '../services/mlService.ts';
import { firestoreListCollection } from '../services/firestoreRestService.ts';
import { COMPLAINT_STATUSES, CivicCategory, ComplaintRecord } from '../../shared/types.ts';

export const aiRoutes = Router();

interface GisMarkerDoc {
  id: string;
  title: string;
  category: CivicCategory;
  priority: ComplaintRecord['priority'];
  status: ComplaintRecord['status'];
  latitude: number;
  longitude: number;
  address: string;
  wardId?: string;
  createdAt?: string;
}

async function fetchActiveMarkersForDuplicateCheck(idToken: string): Promise<ComplaintRecord[]> {
  try {
    const markers = await firestoreListCollection<GisMarkerDoc>('gis_markers', idToken, 300, {
      field: 'status',
      op: 'IN',
      value: [...COMPLAINT_STATUSES],
    });
    return markers.map((m) => ({
      id: m.id,
      citizenId: '',
      citizenName: '',
      title: m.title || '',
      description: `${m.title || ''} ${m.address || ''}`,
      category: (m.category as CivicCategory) || 'Other Civic Issues',
      priority: m.priority || 'Medium',
      status: m.status || 'Submitted',
      latitude: Number(m.latitude || 0),
      longitude: Number(m.longitude || 0),
      address: m.address || '',
      wardId: m.wardId || 'ward_14',
      aiPrediction: {
        predictedCategory: (m.category as CivicCategory) || 'Other Civic Issues',
        predictedPriority: m.priority || 'Medium',
        recommendedDepartmentId: 'dept_general',
        recommendedDepartmentName: 'General Municipal Grievance Cell',
        modelSource: 'demonstration-baseline-classifier',
        modelLabel: 'Rule + Lexical Baseline',
        matchedKeywords: [],
        explanation: '',
      },
      potentialDuplicates: [],
      isDemoData: false,
      createdAt: m.createdAt || new Date().toISOString(),
      updatedAt: m.createdAt || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

aiRoutes.get('/status', async (_req, res) => {
  const health = await mlService.getHealth();
  res.json({
    ...health,
    limitationNotice: health.pythonServiceReachable
      ? null
      : 'Trained Python FastAPI ML service is not currently reachable (ML_SERVICE_URL unset or offline). Fallback rule-based triage is active and is explicitly labeled as a baseline heuristic, not a trained ML model.',
  });
});

aiRoutes.post('/analyze', async (req: AuthenticatedRequest, res) => {
  const { title, description, category, latitude, longitude } = req.body as {
    title?: string;
    description?: string;
    category?: string;
    latitude?: number;
    longitude?: number;
  };
  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required.' });
    return;
  }

  const authedUser = await resolveAuthUser(req);
  const idToken = req.firebaseIdToken;

  const [prediction, health, existingMarkers] = await Promise.all([
    mlService.analyzeComplaint({ title, description, category, latitude, longitude }),
    mlService.getHealth(),
    authedUser && idToken && typeof latitude === 'number' && typeof longitude === 'number'
      ? fetchActiveMarkersForDuplicateCheck(idToken)
      : Promise.resolve([]),
  ]);

  const dupResult =
    authedUser && idToken && typeof latitude === 'number' && typeof longitude === 'number'
      ? await mlService.checkDuplicates(
          {
            title,
            description,
            category: (category as CivicCategory) || prediction.predictedCategory,
            latitude,
            longitude,
          },
          existingMarkers
        )
      : { candidates: [], modelSource: prediction.modelSource };

  res.json({
    prediction,
    duplicates: dupResult.candidates,
    mlServiceAvailable: health.pythonServiceReachable,
    limitationNotice: health.pythonServiceReachable
      ? null
      : 'Python FastAPI trained ML service (ML_SERVICE_URL) is not connected. Results below come from the fallback rule-based baseline classifier.',
  });
});

aiRoutes.post('/classify', async (req, res) => {
  const { title, description, category } = req.body as {
    title?: string;
    description?: string;
    category?: string;
  };
  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required.' });
    return;
  }
  const result = await mlService.analyzeComplaint({ title, description, category });
  res.json({
    predictedCategory: result.predictedCategory,
    matchedKeywords: result.matchedKeywords,
    explanation: result.explanation,
    modelSource: result.modelSource,
    modelLabel: result.modelLabel,
  });
});

aiRoutes.post('/priority', async (req, res) => {
  const { title, description, category } = req.body as {
    title?: string;
    description?: string;
    category?: string;
  };
  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required.' });
    return;
  }
  const result = await mlService.analyzeComplaint({ title, description, category });
  res.json({
    predictedPriority: result.predictedPriority,
    explanation: result.explanation,
    modelSource: result.modelSource,
    modelLabel: result.modelLabel,
  });
});

aiRoutes.post('/route', async (req, res) => {
  const { title, description, category } = req.body as {
    title?: string;
    description?: string;
    category?: string;
  };
  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required.' });
    return;
  }
  const result = await mlService.analyzeComplaint({ title, description, category });
  res.json({
    recommendedDepartmentId: result.recommendedDepartmentId,
    recommendedDepartmentName: result.recommendedDepartmentName,
    predictedCategory: result.predictedCategory,
    modelSource: result.modelSource,
    modelLabel: result.modelLabel,
  });
});

aiRoutes.post(
  '/duplicate-check',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    const { title, description, category, latitude, longitude } = req.body as {
      title?: string;
      description?: string;
      category?: CivicCategory;
      latitude?: number;
      longitude?: number;
    };
    if (!title || !description || typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ error: 'title, description, latitude, and longitude are required.' });
      return;
    }
    const existingMarkers = await fetchActiveMarkersForDuplicateCheck(req.firebaseIdToken!);
    const result = await mlService.checkDuplicates(
      {
        title,
        description,
        category: category || 'Other Civic Issues',
        latitude,
        longitude,
      },
      existingMarkers
    );
    res.json(result);
  }
);
