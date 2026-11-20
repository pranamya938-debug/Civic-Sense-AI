import { Router } from 'express';
import {
  AuthenticatedRequest,
  loadRoleScopedCollectionDocs,
  requireAuth,
  requireRole,
  resolveAuthUser,
} from '../middleware/authMiddleware.ts';
import { mlService } from '../services/mlService.ts';
import {
  GeminiVisionServiceError,
  ImageValidationError,
  analyzeCivicImage,
  isGeminiVisionConfigured,
} from '../services/geminiVisionService.ts';
import { MUNICIPAL_DEPARTMENTS } from '../../shared/catalog.ts';
import { evaluateComplaintConsistency } from '../../shared/imageConsistency.ts';
import {
  CIVIC_CATEGORIES,
  CivicCategory,
  ComplaintPriority,
  ComplaintRecord,
  UserProfile,
} from '../../shared/types.ts';

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

const PRIORITY_RANK: Record<ComplaintPriority, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

async function fetchScopedMarkersForDuplicateCheck(
  user: UserProfile,
  idToken: string
): Promise<ComplaintRecord[]> {
  try {
    const collectionName = user.role === 'citizen' ? 'complaints' : 'gis_markers';
    const markers = await loadRoleScopedCollectionDocs<GisMarkerDoc>(
      collectionName,
      user,
      idToken,
      300
    );
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

aiRoutes.get(
  '/status',
  requireAuth,
  requireRole('citizen', 'authority', 'admin', 'system'),
  async (_req, res) => {
    const health = await mlService.getHealth();
    res.json({
      configured: Boolean(health.configuredUrl),
      configuredUrl: health.configuredUrl ? 'Configured (server-side)' : null,
      pythonServiceReachable: health.pythonServiceReachable,
      geminiVisionConfigured: isGeminiVisionConfigured(),
      activeMode: health.activeMode,
      limitationNotice: health.pythonServiceReachable
        ? null
        : 'Trained Python FastAPI ML service is not currently reachable (ML_SERVICE_URL unset or offline). Fallback rule-based text triage is active and is explicitly labeled as a baseline heuristic; uploaded images are analyzed separately by server-side Gemini multimodal vision.',
    });
  }
);

aiRoutes.post(
  '/analyze-image',
  requireAuth,
  requireRole('citizen', 'authority', 'admin', 'system'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const body =
        req.body && typeof req.body === 'object'
          ? (req.body as {
              imageDataUrl?: string;
              complaintTitle?: string;
              complaintDescription?: string;
              selectedCategory?: string;
            })
          : {};

      if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
        res.status(400).json({
          success: false,
          code: 'INVALID_IMAGE',
          error: 'An uploaded photograph (base64 data URL) is required.',
        });
        return;
      }

      // Gemini inspects ONLY the raw photograph bytes (never text hints)
      const visionResult = await analyzeCivicImage(body.imageDataUrl);
      const selectedCategory =
        body.selectedCategory && CIVIC_CATEGORIES.includes(body.selectedCategory as CivicCategory)
          ? (body.selectedCategory as CivicCategory)
          : undefined;

      const consistency = evaluateComplaintConsistency(visionResult, {
        title: typeof body.complaintTitle === 'string' ? body.complaintTitle : undefined,
        description:
          typeof body.complaintDescription === 'string' ? body.complaintDescription : undefined,
        selectedCategory,
      });

      res.json({
        success: true,
        analysis: {
          ...visionResult,
          ...consistency,
        },
      });
    } catch (err) {
      if (err instanceof ImageValidationError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      if (err instanceof GeminiVisionServiceError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Unable to analyze this photograph right now.';
      res.status(500).json({
        success: false,
        code: 'IMAGE_ANALYSIS_FAILED',
        error: message,
      });
    }
  }
);

aiRoutes.post('/analyze', async (req: AuthenticatedRequest, res) => {
  const {
    title,
    description,
    category,
    latitude,
    longitude,
    citizenConfirmedCategory,
    imageAnalysis,
  } = req.body as {
    title?: string;
    description?: string;
    category?: string;
    latitude?: number;
    longitude?: number;
    citizenConfirmedCategory?: boolean;
    imageAnalysis?: {
      mapped_civic_category?: CivicCategory;
      severity?: ComplaintPriority;
      suggested_department_id?: string;
      suggested_department?: string;
      detected_problem?: string;
    };
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
      ? fetchScopedMarkersForDuplicateCheck(authedUser, idToken)
      : Promise.resolve([]),
  ]);

  const effectiveCategory: CivicCategory =
    citizenConfirmedCategory && category && CIVIC_CATEGORIES.includes(category as CivicCategory)
      ? (category as CivicCategory)
      : prediction.predictedCategory;

  let effectivePriority = prediction.predictedPriority;
  if (
    imageAnalysis?.severity &&
    PRIORITY_RANK[imageAnalysis.severity] > PRIORITY_RANK[effectivePriority]
  ) {
    effectivePriority = imageAnalysis.severity;
  }

  const matchedDept =
    MUNICIPAL_DEPARTMENTS.find((d) => d.categories.includes(effectiveCategory)) ||
    MUNICIPAL_DEPARTMENTS.find((d) => d.id === prediction.recommendedDepartmentId) ||
    MUNICIPAL_DEPARTMENTS.find((d) => d.id === 'dept_general')!;

  const combinedPrediction = {
    ...prediction,
    predictedCategory: effectiveCategory,
    predictedPriority: effectivePriority,
    recommendedDepartmentId: matchedDept.id,
    recommendedDepartmentName: matchedDept.name,
    explanation: imageAnalysis?.detected_problem
      ? `${prediction.explanation} Combined with Gemini visual inspection (${imageAnalysis.detected_problem}; category ${citizenConfirmedCategory ? 'confirmed by citizen' : 'suggested'}).`
      : prediction.explanation,
  };

  const dupResult =
    authedUser && idToken && typeof latitude === 'number' && typeof longitude === 'number'
      ? await mlService.checkDuplicates(
          {
            title,
            description,
            category: effectiveCategory,
            latitude,
            longitude,
          },
          existingMarkers
        )
      : { candidates: [], modelSource: prediction.modelSource };

  res.json({
    prediction: combinedPrediction,
    duplicates: dupResult.candidates,
    mlServiceAvailable: health.pythonServiceReachable,
    limitationNotice: health.pythonServiceReachable
      ? null
      : 'Python FastAPI trained ML service (ML_SERVICE_URL) is not connected. Text triage results come from the fallback rule-based baseline classifier.',
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
  requireRole('citizen', 'authority', 'admin'),
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
    const existingMarkers = await fetchScopedMarkersForDuplicateCheck(
      req.user!,
      req.firebaseIdToken!
    );
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
