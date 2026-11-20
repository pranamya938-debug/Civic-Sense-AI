import { GoogleGenAI, Type } from '@google/genai';
import { MUNICIPAL_DEPARTMENTS } from '../../shared/catalog.ts';
import {
  CIVIC_CATEGORIES,
  CivicCategory,
  ComplaintPriority,
  ImageAnalysisResult,
  ImageQuality,
  ImageRelevanceStatus,
} from '../../shared/types.ts';

const GEMINI_VISION_MODEL = 'gemini-4-hydrogen';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UNRELATED_REJECTION_MESSAGE =
  'This photograph does not appear to show a recognizable civic issue. Please upload a photograph related to a municipal problem.';

export class ImageValidationError extends Error {
  statusCode = 400;
  code = 'INVALID_IMAGE';
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export class GeminiVisionServiceError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 502, code = 'GEMINI_UNAVAILABLE') {
    super(message);
    this.name = 'GeminiVisionServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function parseImageDataUrl(imageDataUrl: string): { mimeType: string; base64Data: string } {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.trim()) {
    throw new ImageValidationError('An uploaded photograph (base64 data URL) is required.');
  }
  const trimmed = imageDataUrl.trim();
  const match = /^data:(image\/[a-zA-Z0-9+.-]+)(?:;[a-zA-Z0-9=._-]+)*;base64,([\s\S]+)$/.exec(
    trimmed
  );
  if (!match) {
    throw new ImageValidationError(
      'Invalid image payload. Supported formats are JPEG, PNG, and WEBP base64 data URLs.'
    );
  }
  let mimeType = match[1].toLowerCase();
  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

  const base64Data = match[2].replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
    throw new ImageValidationError('Invalid base64 image encoding.');
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ImageValidationError(
      `Unsupported image MIME type (${mimeType}). Only image/jpeg, image/png, and image/webp are permitted.`
    );
  }
  const decodedBytes = Buffer.from(base64Data, 'base64').byteLength;
  if (decodedBytes === 0 || decodedBytes > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      'Image file exceeds the 2 MB maximum upload limit or is empty.'
    );
  }
  return { mimeType, base64Data };
}

function normalizeMappedCategory(raw: unknown): CivicCategory {
  if (typeof raw === 'string' && CIVIC_CATEGORIES.includes(raw as CivicCategory)) {
    return raw as CivicCategory;
  }
  const lower = String(raw || '').toLowerCase();
  if (lower.includes('pothole') || lower.includes('road') || lower.includes('footpath')) {
    return 'Road Damage and Potholes';
  }
  if (lower.includes('garbage') || lower.includes('waste') || lower.includes('dump')) {
    return 'Garbage and Waste Management';
  }
  if (
    lower.includes('drain') ||
    lower.includes('sewage') ||
    lower.includes('manhole') ||
    lower.includes('flood') ||
    lower.includes('waterlog')
  ) {
    return 'Drainage and Sewage';
  }
  if (lower.includes('water') || lower.includes('pipe') || lower.includes('leak')) {
    return 'Water Supply and Leakage';
  }
  if (lower.includes('street') || lower.includes('light') || lower.includes('lamp')) {
    return 'Streetlight Problems';
  }
  if (lower.includes('sanit') || lower.includes('hygiene') || lower.includes('toilet')) {
    return 'Sanitation';
  }
  if (
    lower.includes('infra') ||
    lower.includes('bench') ||
    lower.includes('park') ||
    lower.includes('sign') ||
    lower.includes('bridge')
  ) {
    return 'Public Infrastructure';
  }
  return 'Other Civic Issues';
}

function normalizeSeverity(raw: unknown): ComplaintPriority {
  if (raw === 'Low' || raw === 'Medium' || raw === 'High' || raw === 'Critical') {
    return raw;
  }
  return 'Medium';
}

function normalizeImageQuality(raw: unknown): ImageQuality {
  if (raw === 'Good' || raw === 'Poor' || raw === 'Unclear') {
    return raw;
  }
  return 'Unclear';
}

function normalizeRelevanceStatus(
  rawStatus: unknown,
  isCivicIssue: boolean,
  imageQuality: ImageQuality
): ImageRelevanceStatus {
  if (
    rawStatus === 'relevant' ||
    rawStatus === 'unrelated' ||
    rawStatus === 'unclear' ||
    rawStatus === 'uncertain'
  ) {
    return rawStatus;
  }
  if (!isCivicIssue && imageQuality !== 'Good') return 'unclear';
  if (!isCivicIssue) return 'unrelated';
  return 'relevant';
}

function findDepartmentForCategory(category: CivicCategory): { id: string; name: string } {
  const dept =
    MUNICIPAL_DEPARTMENTS.find((d) => d.categories.includes(category)) ||
    MUNICIPAL_DEPARTMENTS.find((d) => d.id === 'dept_general')!;
  return { id: dept.id, name: dept.name };
}

function stripJsonCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/key=[0-9A-Za-z_-]+/gi, 'key=[REDACTED]')
    .slice(0, 420);
}

function extractReadableGoogleError(rawMsg: string): string {
  try {
    const parsed = JSON.parse(rawMsg) as { error?: { message?: string } };
    if (parsed?.error?.message) {
      return sanitizeErrorMessage(parsed.error.message);
    }
  } catch {
    // not raw JSON
  }
  return sanitizeErrorMessage(rawMsg);
}

function classifyGeminiError(err: unknown): GeminiVisionServiceError {
  if (err instanceof GeminiVisionServiceError) return err;
  const rawMsg = err instanceof Error ? err.message : String(err || 'Gemini vision request failed.');
  const msg = extractReadableGoogleError(rawMsg);
  console.error('[GeminiVision Error]', msg);
  const upper = rawMsg.toUpperCase();

  if (upper.includes('FREE TIER IS NOT AVAILABLE') || upper.includes('SET UP BILLING')) {
    return new GeminiVisionServiceError(
      'Gemini API billing is required for this project (free tier unavailable). Enable billing or select a billing-enabled GEMINI_API_KEY in Settings > Secrets.',
      503,
      'GEMINI_BILLING_REQUIRED'
    );
  }
  if (
    upper.includes('API_KEY_INVALID') ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('UNAUTHENTICATED') ||
    upper.includes('401') ||
    upper.includes('403')
  ) {
    return new GeminiVisionServiceError(
      `Gemini API authentication failed (${msg}). Please verify GEMINI_API_KEY in Settings > Secrets.`,
      502,
      'GEMINI_AUTH_ERROR'
    );
  }
  if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('429')) {
    return new GeminiVisionServiceError(
      'Gemini AI rate limit exceeded. Please wait a moment and retry.',
      429,
      'GEMINI_RATE_LIMIT'
    );
  }
  if (upper.includes('NOT_FOUND') || upper.includes('404')) {
    return new GeminiVisionServiceError(
      `Configured Gemini model (${GEMINI_VISION_MODEL}) was not found or is unavailable.`,
      502,
      'GEMINI_MODEL_NOT_FOUND'
    );
  }
  return new GeminiVisionServiceError(
    `Unable to analyze this photograph right now (${msg}).`,
    502,
    'GEMINI_UPSTREAM_ERROR'
  );
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  const upper = msg.toUpperCase();
  return (
    upper.includes('429') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('503') ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('ETIMEDOUT') ||
    upper.includes('ECONNRESET') ||
    upper.includes('FETCH FAILED')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGeminiVisionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
}

export async function analyzeCivicImage(imageDataUrl: string): Promise<ImageAnalysisResult> {
  const { mimeType, base64Data } = parseImageDataUrl(imageDataUrl);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiVisionServiceError(
      'GEMINI_API_KEY is not configured on the server. Multimodal image verification is unavailable.',
      503,
      'GEMINI_NOT_CONFIGURED'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const promptText = `You are a municipal civic infrastructure visual inspector for CivicSense AI.
Inspect ONLY the actual visual contents of this uploaded photograph. Do NOT assume anything that is not visibly shown.

Determine whether the photograph shows a real civic / municipal grievance issue, such as:
- Potholes, cracked asphalt, damaged roads
- Garbage accumulation, overflowing bins, illegal waste dumping
- Overflowing drainage, sewage backups, blocked storm drains
- Water leakage, burst pipes, leaking municipal hydrants
- Broken, fallen, or non-functional streetlights / lamp poles
- Damaged footpaths, broken sidewalks, collapsed curbs
- Open or missing manholes
- Waterlogging or urban street flooding
- Damaged public infrastructure (public benches, bus shelters, parks, traffic signals, fallen trees blocking roads)
- Other legitimate civic or municipal hazards (identify clearly without forcing into a wrong category).

Strict relevance & quality rules:
1. RELEVANT ('relevant'): If one or more visible civic issues are clearly identifiable and image quality is sufficient. If multiple civic issues appear in the same image (e.g. potholes + garbage, or waterlogging + open drain), identify the primary category, mention ALL visible issues in detected_problem, description, and visible_evidence, and elevate severity if hazards compound.
2. UNRELATED ('unrelated'): If the photograph shows non-civic scenes (logos, institutional emblems, screenshots, selfies, portraits, pets/animals, food/meals, indoor private rooms, clean scenic nature, memes, documents, random personal items). Set is_civic_issue=false, relevance_status='unrelated', detected_category='Non-Civic / Unrelated Image', detected_problem='No recognizable civic issue', and description='${UNRELATED_REJECTION_MESSAGE}'. NEVER invent a civic problem when none is visible.
3. UNCLEAR / POOR QUALITY ('unclear'): If the photograph is severely blurry, out-of-focus, too dark, heavily overexposed, obstructed, or too low-detail to reliably judge whether a civic problem exists. Set is_civic_issue=false, relevance_status='unclear', image_quality='Poor' or 'Unclear', and clearly explain why a clearer photograph is needed.
4. UNCERTAIN ('uncertain'): If a potential municipal issue might exist but visual context is ambiguous (e.g., partial view, unclear if public municipal property vs private property, minor damp spot vs pipe leak). Set relevance_status='uncertain', is_civic_issue=true, explain the visual uncertainty clearly, and provide recommendations so the citizen can decide whether to proceed.

Choose mapped_civic_category from the exact canonical CivicSense AI categories:
- "Garbage and Waste Management"
- "Road Damage and Potholes"
- "Water Supply and Leakage"
- "Drainage and Sewage"
- "Streetlight Problems"
- "Sanitation"
- "Public Infrastructure"
- "Other Civic Issues"

Provide concise, factual visible_evidence observations strictly grounded in pixels visible in the photograph.`;

  let rawText: string | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_VISION_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: promptText,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              is_civic_issue: { type: Type.BOOLEAN },
              relevance_status: {
                type: Type.STRING,
                enum: ['relevant', 'unrelated', 'unclear', 'uncertain'],
              },
              detected_category: { type: Type.STRING },
              mapped_civic_category: {
                type: Type.STRING,
                enum: CIVIC_CATEGORIES,
              },
              detected_problem: { type: Type.STRING },
              description: { type: Type.STRING },
              severity: {
                type: Type.STRING,
                enum: ['Low', 'Medium', 'High', 'Critical'],
              },
              confidence: { type: Type.NUMBER },
              visible_evidence: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              suggested_department: { type: Type.STRING },
              image_quality: {
                type: Type.STRING,
                enum: ['Good', 'Poor', 'Unclear'],
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'is_civic_issue',
              'relevance_status',
              'detected_category',
              'mapped_civic_category',
              'detected_problem',
              'description',
              'severity',
              'confidence',
              'visible_evidence',
              'suggested_department',
              'image_quality',
              'recommendations',
            ],
          },
        },
      });

      if (!response) {
        throw new GeminiVisionServiceError(
          'Gemini returned a null response object.',
          502,
          'GEMINI_EMPTY_RESPONSE'
        );
      }

      rawText = typeof response.text === 'string' ? response.text.trim() : '';
      if (!rawText) {
        const finishReason = response.candidates?.[0]?.finishReason;
        throw new GeminiVisionServiceError(
          finishReason
            ? `Gemini could not return image analysis text (finishReason: ${String(finishReason)}).`
            : 'Gemini returned an empty response during image analysis.',
          502,
          'GEMINI_EMPTY_RESPONSE'
        );
      }

      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt === 0 && isTransientError(err)) {
        await sleep(600);
        continue;
      }
      throw classifyGeminiError(err);
    }
  }

  if (lastError) {
    throw classifyGeminiError(lastError);
  }

  if (!rawText) {
    throw new GeminiVisionServiceError(
      'Gemini returned an empty response during image analysis.',
      502,
      'GEMINI_EMPTY_RESPONSE'
    );
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(stripJsonCodeFence(rawText));
  } catch {
    throw new GeminiVisionServiceError(
      'Gemini returned malformed JSON for image analysis.',
      502,
      'GEMINI_MALFORMED_JSON'
    );
  }

  if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
    throw new GeminiVisionServiceError(
      'Gemini returned a null or non-object JSON payload for image analysis.',
      502,
      'GEMINI_INVALID_SHAPE'
    );
  }

  const parsed = parsedUnknown as Record<string, unknown>;
  const imageQuality = normalizeImageQuality(parsed.image_quality);
  const rawIsCivic = Boolean(parsed.is_civic_issue);
  let relevanceStatus = normalizeRelevanceStatus(parsed.relevance_status, rawIsCivic, imageQuality);

  if (!rawIsCivic && relevanceStatus === 'relevant') {
    relevanceStatus = imageQuality === 'Good' ? 'unrelated' : 'unclear';
  }

  const isCivicIssue = relevanceStatus === 'relevant' || relevanceStatus === 'uncertain';
  const mappedCategory = normalizeMappedCategory(
    parsed.mapped_civic_category || parsed.detected_category
  );
  const dept = findDepartmentForCategory(mappedCategory);

  const numericConfidence = Number(parsed.confidence);
  const clampedConfidence = Number.isFinite(numericConfidence)
    ? Math.max(0, Math.min(1, Number(numericConfidence.toFixed(2))))
    : 0.5;

  const visibleEvidence = Array.isArray(parsed.visible_evidence)
    ? parsed.visible_evidence
        .map((item) => String(item || '').trim().slice(0, 140))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .map((item) => String(item || '').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  let description = String(parsed.description || '').trim().slice(0, 480);
  if (relevanceStatus === 'unrelated') {
    description = UNRELATED_REJECTION_MESSAGE;
  } else if (relevanceStatus === 'unclear' && !description) {
    description =
      'The uploaded photograph is too blurry, dark, or obstructed to verify a civic issue. Please capture and upload a clearer photograph.';
  } else if (!description) {
    description = 'Visual inspection completed; review detected category and evidence below.';
  }

  const detectedCategory =
    relevanceStatus === 'unrelated'
      ? 'Non-Civic / Unrelated Image'
      : String(parsed.detected_category || mappedCategory).trim().slice(0, 120);

  const detectedProblem =
    relevanceStatus === 'unrelated'
      ? 'No recognizable civic issue'
      : String(parsed.detected_problem || detectedCategory).trim().slice(0, 160);

  const suggestedDepartment =
    relevanceStatus === 'unrelated'
      ? 'Not Applicable'
      : String(parsed.suggested_department || dept.name).trim().slice(0, 120);

  return {
    is_civic_issue: isCivicIssue,
    relevance_status: relevanceStatus,
    detected_category: detectedCategory,
    mapped_civic_category: mappedCategory,
    detected_problem: detectedProblem,
    description,
    severity: normalizeSeverity(parsed.severity),
    confidence: clampedConfidence,
    confidence_note:
      'Model-reported visual heuristic confidence (not statistically calibrated). Citizen confirmation is required.',
    visible_evidence: visibleEvidence,
    suggested_department: suggestedDepartment,
    suggested_department_id: dept.id,
    image_quality: imageQuality,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : relevanceStatus === 'unrelated'
          ? ['Upload a clear photograph showing the civic infrastructure problem directly.']
          : relevanceStatus === 'unclear'
            ? ['Retake the photo in better lighting and ensure the issue is in sharp focus.']
            : ['Review the detected issue and confirm or adjust the civic category before submitting.'],
    description_consistency: 'not_provided',
    description_consistency_note:
      'Enter a complaint title and description to verify text-to-image consistency.',
    category_consistency: 'not_provided',
    category_consistency_note: 'No category selected for comparison.',
    analyzed_at: new Date().toISOString(),
    model_used: GEMINI_VISION_MODEL,
  };
}
