import { ENV } from '../config/env.ts';
import {
  AiPredictionResult,
  CivicCategory,
  ComplaintRecord,
  DuplicateCandidate,
} from '../../shared/types.ts';
import { detectBaselineDuplicates, runBaselineClassifier } from './baselineClassifier.ts';

async function callFastApi<T>(path: string, body: unknown): Promise<T | null> {
  if (!ENV.ML_SERVICE_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${ENV.ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const mlService = {
  async getHealth(): Promise<{
    configuredUrl: string | null;
    pythonServiceReachable: boolean;
    activeMode: 'python-fastapi-ml-service' | 'demonstration-baseline-classifier';
  }> {
    if (!ENV.ML_SERVICE_URL) {
      return {
        configuredUrl: null,
        pythonServiceReachable: false,
        activeMode: 'demonstration-baseline-classifier',
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(`${ENV.ML_SERVICE_URL}/health`, { signal: controller.signal });
      const ok = res.ok;
      return {
        configuredUrl: ENV.ML_SERVICE_URL,
        pythonServiceReachable: ok,
        activeMode: ok ? 'python-fastapi-ml-service' : 'demonstration-baseline-classifier',
      };
    } catch {
      return {
        configuredUrl: ENV.ML_SERVICE_URL,
        pythonServiceReachable: false,
        activeMode: 'demonstration-baseline-classifier',
      };
    } finally {
      clearTimeout(timer);
    }
  },

  async analyzeComplaint(input: {
    title: string;
    description: string;
    category?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<AiPredictionResult> {
    const remote = await callFastApi<AiPredictionResult>('/predict/analyze', input);
    if (remote && remote.predictedCategory) {
      return {
        ...remote,
        modelSource: 'python-fastapi-ml-service',
        modelLabel: 'Python FastAPI ML Service',
      };
    }
    return runBaselineClassifier(input.title, input.description, input.category);
  },

  async checkDuplicates(
    input: {
      title: string;
      description: string;
      category: CivicCategory;
      latitude: number;
      longitude: number;
    },
    existingComplaints: ComplaintRecord[]
  ): Promise<{ candidates: DuplicateCandidate[]; modelSource: string }> {
    const remote = await callFastApi<{ candidates: DuplicateCandidate[]; modelSource: string }>(
      '/predict/duplicate-check',
      {
        ...input,
        existingComplaints: existingComplaints.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          category: c.category,
          status: c.status,
          latitude: c.latitude,
          longitude: c.longitude,
          createdAt: c.createdAt,
        })),
      }
    );
    if (remote && Array.isArray(remote.candidates)) {
      return {
        candidates: remote.candidates,
        modelSource: 'python-fastapi-ml-service',
      };
    }
    return {
      candidates: detectBaselineDuplicates(input, existingComplaints),
      modelSource: 'demonstration-baseline-classifier',
    };
  },
};
