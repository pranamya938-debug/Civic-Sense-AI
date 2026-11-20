import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cpu,
  Crosshair,
  Eye,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  AiPredictionResult,
  CIVIC_CATEGORIES,
  CivicCategory,
  ComplaintRecord,
  ConsistencyStatus,
  DuplicateCandidate,
  ImageAnalysisResult,
  Ward,
} from '../shared/types';
import { evaluateComplaintConsistency } from '../shared/imageConsistency';
import { apiRequest } from '../services/apiClient';
import { submitComplaintToFirestore } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { GisMap } from './GisMap';

interface ComplaintFormProps {
  wards: Ward[];
  onSubmitted: (complaint: ComplaintRecord) => void;
}

interface AiAnalyzeResponse {
  prediction: AiPredictionResult;
  duplicates: DuplicateCandidate[];
  mlServiceAvailable: boolean;
  limitationNotice: string | null;
}

interface AnalyzeImageResponse {
  success?: boolean;
  analysis?: ImageAnalysisResult;
  error?: string;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function consistencyBadgeLabel(status: ConsistencyStatus): string {
  if (status === 'consistent') return 'Consistent';
  if (status === 'mismatch') return 'Mismatch Flagged';
  if (status === 'uncertain') return 'Needs Verification';
  return 'Pending Text Input';
}

function consistencyBadgeStyle(status: ConsistencyStatus): string {
  if (status === 'consistent') return 'bg-emerald-50 text-emerald-900 border-emerald-300';
  if (status === 'mismatch') return 'bg-red-50 text-red-900 border-red-300';
  if (status === 'uncertain') return 'bg-amber-50 text-amber-900 border-amber-300';
  return 'bg-neutral-50 text-neutral-700 border-neutral-300';
}

function relevanceBadgeLabel(status: ImageAnalysisResult['relevance_status']): string {
  if (status === 'relevant') return 'Relevant Civic Issue';
  if (status === 'unrelated') return 'Unrelated / Non-Civic Image';
  if (status === 'unclear') return 'Unclear / Low Quality';
  return 'Uncertain Relevance';
}

export const ComplaintForm: React.FC<ComplaintFormProps> = ({ wards, onSubmitted }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CivicCategory>('Road Damage and Potholes');
  const [autoClassify, setAutoClassify] = useState(true);
  const [citizenConfirmedCategory, setCitizenConfirmedCategory] = useState(false);

  const [address, setAddress] = useState('');
  const [wardId, setWardId] = useState(wards[0]?.id || 'ward_14');
  const [latitude, setLatitude] = useState(wards[0]?.centerLat ?? 12.9784);
  const [longitude, setLongitude] = useState(wards[0]?.centerLng ?? 77.6408);

  // Image verification state: photo stays in memory until relevant + confirmed by citizen
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState<string>('');
  const [photoPreviewDataUrl, setPhotoPreviewDataUrl] = useState<string>('');
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [imageConfirmed, setImageConfirmed] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPredictionResult | null>(null);
  const [mlLimitation, setMlLimitation] = useState<string | null>(null);
  const [aiServiceStatus, setAiServiceStatus] = useState<{
    pythonServiceReachable: boolean;
    geminiVisionConfigured?: boolean;
    activeMode: string;
    limitationNotice: string | null;
  } | null>(null);
  const [dupPreview, setDupPreview] = useState<DuplicateCandidate[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{
      pythonServiceReachable: boolean;
      geminiVisionConfigured?: boolean;
      activeMode: string;
      limitationNotice: string | null;
    }>('/api/ai/status')
      .then(setAiServiceStatus)
      .catch(() => setAiServiceStatus(null));
  }, []);

  const liveConsistency = useMemo(() => {
    if (!imageAnalysis) return null;
    return evaluateComplaintConsistency(imageAnalysis, {
      title,
      description,
      selectedCategory: category,
    });
  }, [imageAnalysis, title, description, category]);

  const clearSelectedPhoto = () => {
    setPendingImageDataUrl('');
    setPhotoPreviewDataUrl('');
    setImageAnalysis(null);
    setImageConfirmed(false);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGeoNote('Browser geolocation is unavailable. Click the map below to set coordinates.');
      return;
    }
    setGeoLoading(true);
    setGeoNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(Number(pos.coords.latitude.toFixed(6)));
        setLongitude(Number(pos.coords.longitude.toFixed(6)));
        setGeoNote('Live GPS coordinates captured from browser.');
        setGeoLoading(false);
      },
      () => {
        setGeoNote('Location permission denied or unavailable. Click the map or enter coordinates manually.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const runGeminiImageAnalysis = async (dataUrl: string) => {
    setAnalyzingImage(true);
    setImageError(null);
    setImageAnalysis(null);
    setImageConfirmed(false);
    try {
      const res = await apiRequest<AnalyzeImageResponse>('/api/ai/analyze-image', {
        method: 'POST',
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          complaintTitle: title,
          complaintDescription: description,
          selectedCategory: category,
        }),
      });
      if (!res || typeof res !== 'object' || !res.analysis || typeof res.analysis !== 'object') {
        throw new Error(
          res?.error || 'Image verification service returned an empty or malformed response.'
        );
      }
      setImageAnalysis(res.analysis);
    } catch (err) {
      setImageError(
        err instanceof Error && err.message.trim()
          ? err.message
          : 'Unable to analyze this photograph right now. Please retry.'
      );
    } finally {
      setAnalyzingImage(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
      setError('Unsupported file type. Please upload a JPEG, PNG, or WEBP photograph.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 1_900_000) {
      setError('Please select a JPEG, PNG, or WEBP image smaller than 1.9 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    setImageError(null);
    setImageAnalysis(null);
    setImageConfirmed(false);

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      const dataUrl = reader.result;
      setPendingImageDataUrl(dataUrl);
      setPhotoPreviewDataUrl(dataUrl);
      await runGeminiImageAnalysis(dataUrl);
    };
    reader.onerror = () => {
      setImageError('Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmDetection = () => {
    if (!imageAnalysis) return;
    setCategory(imageAnalysis.mapped_civic_category);
    setAutoClassify(false);
    setCitizenConfirmedCategory(true);
    setImageConfirmed(true);
    setError(null);
  };

  const handleIncorrectOrReupload = () => {
    clearSelectedPhoto();
    setCitizenConfirmedCategory(false);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 30);
  };

  const handlePreviewAi = async () => {
    if (title.trim().length < 4 || description.trim().length < 10) {
      setError('Enter a title (4+ chars) and description (10+ chars) before running AI analysis.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const res = await apiRequest<AiAnalyzeResponse>('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          category,
          latitude: Number(latitude),
          longitude: Number(longitude),
          citizenConfirmedCategory,
          imageAnalysis:
            imageAnalysis && imageConfirmed
              ? {
                  mapped_civic_category: imageAnalysis.mapped_civic_category,
                  severity: imageAnalysis.severity,
                  suggested_department_id: imageAnalysis.suggested_department_id,
                  suggested_department: imageAnalysis.suggested_department,
                  detected_problem: imageAnalysis.detected_problem,
                }
              : undefined,
        }),
      });
      setAiPreview(res.prediction);
      setDupPreview(res.duplicates || []);
      setMlLimitation(res.limitationNotice);
      if (autoClassify && !citizenConfirmedCategory) {
        setCategory(res.prediction.predictedCategory);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('You must be signed in to submit a grievance.');
      return;
    }
    if (analyzingImage) {
      setError('Please wait while Gemini AI finishes examining your photograph.');
      return;
    }
    if (pendingImageDataUrl) {
      if (imageError) {
        setError('Please retry image inspection or remove the photograph before submitting.');
        return;
      }
      if (imageAnalysis?.relevance_status === 'unrelated') {
        setError(
          'This photograph does not appear to show a recognizable civic issue. Please upload a valid municipal issue photograph or clear the image.'
        );
        return;
      }
      if (imageAnalysis?.relevance_status === 'unclear') {
        setError(
          'The uploaded photograph is too blurry or dark to verify. Please upload a clearer photograph or clear the image.'
        );
        return;
      }
      if (!imageConfirmed) {
        setError(
          'Please review the Gemini AI visual findings and click "Confirm and Continue" or "Incorrect Detection / Upload Another Image" before submitting.'
        );
        return;
      }
    }

    setError(null);
    setSubmitting(true);
    try {
      let finalPhotoUrl: string | undefined;
      if (pendingImageDataUrl && imageConfirmed) {
        const uploaded = await apiRequest<{ photoUrl: string }>('/api/uploads', {
          method: 'POST',
          body: JSON.stringify({ dataUrl: pendingImageDataUrl }),
        });
        finalPhotoUrl = uploaded.photoUrl;
      }

      const analysis = await apiRequest<AiAnalyzeResponse>('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          latitude: Number(latitude),
          longitude: Number(longitude),
          citizenConfirmedCategory,
          imageAnalysis:
            imageAnalysis && imageConfirmed
              ? {
                  mapped_civic_category: imageAnalysis.mapped_civic_category,
                  severity: imageAnalysis.severity,
                  suggested_department_id: imageAnalysis.suggested_department_id,
                  suggested_department: imageAnalysis.suggested_department,
                  detected_problem: imageAnalysis.detected_problem,
                }
              : undefined,
        }),
      });

      const resolvedCategory: CivicCategory =
        autoClassify && !citizenConfirmedCategory
          ? analysis.prediction.predictedCategory
          : category;

      const created = await submitComplaintToFirestore({
        citizen: user,
        title,
        description,
        category: resolvedCategory,
        address,
        wardId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        photoUrl: finalPhotoUrl,
        aiPrediction: analysis.prediction,
        imageAnalysis: imageConfirmed ? imageAnalysis : null,
        citizenConfirmedCategory,
        duplicates: analysis.duplicates || [],
      });

      setTitle('');
      setDescription('');
      setAddress('');
      clearSelectedPhoto();
      setCitizenConfirmedCategory(false);
      setAutoClassify(true);
      setAiPreview(null);
      setDupPreview([]);
      setMlLimitation(null);
      onSubmitted(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-neutral-100">
        <div>
          <h3 className="text-lg font-display font-semibold text-[#0B3B2E]">Submit a Civic Complaint</h3>
          <p className="text-sm text-neutral-600">
            Provide issue details, verify site photographs with Gemini AI vision, and pin GPS coordinates.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handlePreviewAi()}
          disabled={analyzing}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#0B3B2E] bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
          Run AI Triage Preview
        </button>
      </div>

      {aiServiceStatus && !aiServiceStatus.pythonServiceReachable && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <span>
            <strong>Text Triage Mode:</strong>{' '}
            {aiServiceStatus.limitationNotice ||
              'Python FastAPI ML service is temporarily disconnected. Text classification uses the rule-based baseline; uploaded photographs are inspected by server-side Gemini multimodal vision.'}
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">Complaint Title</label>
            <input
              type="text"
              required
              minLength={4}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Overflowing stormwater drain outside Gandhi Park"
              className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">Detailed Description</label>
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe severity, duration, landmarks, and any public safety risks..."
              className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">Civic Issue Category</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as CivicCategory);
                  setAutoClassify(false);
                  setCitizenConfirmedCategory(true);
                }}
                className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {CIVIC_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 mt-2 text-xs text-neutral-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoClassify}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoClassify(checked);
                    if (checked) setCitizenConfirmedCategory(false);
                  }}
                  className="rounded border-neutral-300 text-emerald-700 focus:ring-emerald-600"
                />
                Use AI-predicted category on submission
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-800 mb-1.5">Municipal Ward</label>
              <select
                value={wardId}
                onChange={(e) => {
                  setWardId(e.target.value);
                  const w = wards.find((x) => x.id === e.target.value);
                  if (w) {
                    setLatitude(w.centerLat);
                    setLongitude(w.centerLng);
                  }
                }}
                className="w-full px-3 py-2.5 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-1.5">
              Site Photograph (JPEG/PNG/WEBP, max 1.9 MB — Inspected by Gemini AI)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer">
                {analyzingImage ? <Loader2 className="w-4 h-4 animate-spin text-emerald-700" /> : <Camera className="w-4 h-4" />}
                {analyzingImage ? 'Examining Image...' : photoPreviewDataUrl ? 'Choose Different Photo' : 'Upload Photograph'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handlePhotoSelect(e)}
                  className="hidden"
                />
              </label>
              {photoPreviewDataUrl && (
                <button
                  type="button"
                  onClick={clearSelectedPhoto}
                  className="text-xs text-red-700 hover:underline cursor-pointer"
                >
                  Clear Photo
                </button>
              )}
            </div>

            {photoPreviewDataUrl && (
              <div className="mt-3 flex flex-wrap items-start gap-4">
                <div className="w-48 h-32 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100 shrink-0">
                  <img
                    src={photoPreviewDataUrl}
                    alt="Selected civic evidence"
                    className="w-full h-full object-cover"
                  />
                </div>
                {analyzingImage && (
                  <div className="flex-1 min-w-[220px] p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#0B3B2E]">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                      Gemini AI is examining your photograph...
                    </div>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Inspecting visual contents for municipal infrastructure issues, photo clarity, and complaint consistency.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-neutral-800">Address / Locality</label>
              <button
                type="button"
                onClick={handleCaptureGps}
                disabled={geoLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900 cursor-pointer"
              >
                {geoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
                Capture Browser GPS
              </button>
            </div>
            <input
              type="text"
              required
              minLength={3}
              maxLength={280}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street name, junction, or neighborhood landmark"
              className="w-full px-3.5 py-2.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            {geoNote && <p className="text-xs text-neutral-500 mt-1">{geoNote}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <GisMap
            complaints={[]}
            heightClass="h-[210px]"
            pickLocationMode
            pickedCoords={{ lat: latitude, lng: longitude }}
            onPickLocation={(lat, lng) => {
              setLatitude(lat);
              setLongitude(lng);
            }}
          />
        </div>
      </div>

      {/* Gemini Multimodal Image Analysis Failure Panel */}
      {imageError && !analyzingImage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
          <div className="flex items-start gap-2.5 text-sm text-red-900">
            <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                Unable to analyze this photograph right now. Please retry.
              </div>
              <p className="text-xs text-red-800 mt-1">{imageError}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingImageDataUrl && (
              <button
                type="button"
                onClick={() => void runGeminiImageAnalysis(pendingImageDataUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-100 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Image Analysis
              </button>
            )}
            <button
              type="button"
              onClick={handleIncorrectOrReupload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload Another Image
            </button>
          </div>
        </div>
      )}

      {/* Unrelated Photograph Panel */}
      {imageAnalysis && !analyzingImage && imageAnalysis.relevance_status === 'unrelated' && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-red-800">
                  Image Relevance: {relevanceBadgeLabel(imageAnalysis.relevance_status)}
                </span>
                <span className="text-xs font-mono text-red-700">{imageAnalysis.model_used}</span>
              </div>
              <p className="text-sm font-medium text-red-900">{imageAnalysis.description}</p>
              {liveConsistency && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2.5 bg-white border border-red-200 rounded-lg">
                    <div className="font-semibold text-red-900">
                      Complaint-Description Consistency: {consistencyBadgeLabel(liveConsistency.description_consistency)}
                    </div>
                    <p className="text-red-800 mt-0.5">{liveConsistency.description_consistency_note}</p>
                  </div>
                  <div className="p-2.5 bg-white border border-red-200 rounded-lg">
                    <div className="font-semibold text-red-900">
                      Selected Category Consistency: {consistencyBadgeLabel(liveConsistency.category_consistency)}
                    </div>
                    <p className="text-red-800 mt-0.5">{liveConsistency.category_consistency_note}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-red-800">
                Rejected photographs are not uploaded or stored. Please upload a clear photograph showing a civic infrastructure problem.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleIncorrectOrReupload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload Another Image
            </button>
            <button
              type="button"
              onClick={clearSelectedPhoto}
              className="px-3.5 py-2 text-xs font-medium bg-white border border-red-300 text-red-800 rounded-lg hover:bg-red-100 cursor-pointer"
            >
              Remove Rejected Photo
            </button>
          </div>
        </div>
      )}

      {/* Unclear / Poor Quality Photograph Panel */}
      {imageAnalysis && !analyzingImage && imageAnalysis.relevance_status === 'unclear' && (
        <div className="p-5 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Image Relevance: {relevanceBadgeLabel(imageAnalysis.relevance_status)} · Quality: {imageAnalysis.image_quality}
                </span>
                <span className="text-xs font-mono text-amber-800">{imageAnalysis.model_used}</span>
              </div>
              <p className="text-sm text-amber-950">{imageAnalysis.description}</p>
              {liveConsistency && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="p-2.5 bg-white border border-amber-200 rounded-lg">
                    <div className="font-semibold text-amber-950">
                      Complaint-Description Consistency: {consistencyBadgeLabel(liveConsistency.description_consistency)}
                    </div>
                    <p className="text-amber-900 mt-0.5">{liveConsistency.description_consistency_note}</p>
                  </div>
                  <div className="p-2.5 bg-white border border-amber-200 rounded-lg">
                    <div className="font-semibold text-amber-950">
                      Selected Category Consistency: {consistencyBadgeLabel(liveConsistency.category_consistency)}
                    </div>
                    <p className="text-amber-900 mt-0.5">{liveConsistency.category_consistency_note}</p>
                  </div>
                </div>
              )}
              <ul className="text-xs text-amber-900 list-disc pl-4 space-y-0.5 pt-1">
                {imageAnalysis.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleIncorrectOrReupload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload Clearer Photograph
            </button>
            <button
              type="button"
              onClick={clearSelectedPhoto}
              className="px-3.5 py-2 text-xs font-medium bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-100 cursor-pointer"
            >
              Clear Photo
            </button>
          </div>
        </div>
      )}

      {/* Relevant or Uncertain Civic Issue Analysis Panel */}
      {imageAnalysis &&
        !analyzingImage &&
        (imageAnalysis.relevance_status === 'relevant' ||
          imageAnalysis.relevance_status === 'uncertain') && (
          <div
            className={`rounded-xl border p-5 space-y-4 ${
              imageAnalysis.relevance_status === 'relevant'
                ? 'bg-[#F7F9F8] border-emerald-300'
                : 'bg-amber-50/70 border-amber-300'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Eye
                  className={`w-4 h-4 ${
                    imageAnalysis.relevance_status === 'relevant'
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                />
                <span className="text-xs font-bold uppercase tracking-wider text-[#0B3B2E]">
                  {imageAnalysis.relevance_status === 'relevant'
                    ? 'AI DETECTED A CIVIC ISSUE'
                    : 'AI VISUAL INSPECTION — UNCERTAIN RELEVANCE'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
                <span>{imageAnalysis.model_used}</span>
                {imageConfirmed && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-sans font-semibold">
                    <CheckCircle2 className="w-3 h-3" />
                    Confirmed by Citizen
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-white border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500">Detected Civic Issue</div>
                <div className="font-semibold text-[#0B3B2E] mt-0.5">
                  {imageAnalysis.detected_problem}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {imageAnalysis.detected_category}
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500">Image Relevance</div>
                <div className="font-semibold text-[#0B3B2E] mt-0.5">
                  {relevanceBadgeLabel(imageAnalysis.relevance_status)}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  Quality: {imageAnalysis.image_quality} · Mapped: {imageAnalysis.mapped_civic_category}
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500">Severity Assessment</div>
                <div className="font-semibold text-orange-700 mt-0.5">
                  {imageAnalysis.severity}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  Model-Reported Confidence: {Math.round(imageAnalysis.confidence * 100)}%
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-lg p-3">
                <div className="text-neutral-500">Suggested Department</div>
                <div className="font-semibold text-[#0B3B2E] mt-0.5">
                  {imageAnalysis.suggested_department}
                </div>
              </div>
            </div>

            {liveConsistency && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div
                  className={`border rounded-lg p-3 ${consistencyBadgeStyle(
                    liveConsistency.description_consistency
                  )}`}
                >
                  <div className="font-semibold">
                    Complaint-Description Consistency:{' '}
                    {consistencyBadgeLabel(liveConsistency.description_consistency)}
                  </div>
                  <p className="mt-1 leading-relaxed">
                    {liveConsistency.description_consistency_note}
                  </p>
                </div>
                <div
                  className={`border rounded-lg p-3 ${consistencyBadgeStyle(
                    liveConsistency.category_consistency
                  )}`}
                >
                  <div className="font-semibold">
                    Selected Category Consistency:{' '}
                    {consistencyBadgeLabel(liveConsistency.category_consistency)}
                  </div>
                  <p className="mt-1 leading-relaxed">
                    {liveConsistency.category_consistency_note}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div>
                <span className="font-semibold text-[#0B3B2E]">Image Description: </span>
                <span className="text-neutral-700 leading-relaxed">
                  {imageAnalysis.description}
                </span>
              </div>

              {imageAnalysis.visible_evidence.length > 0 && (
                <div>
                  <div className="font-semibold text-[#0B3B2E] mb-1">Visible Evidence:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-neutral-700">
                    {imageAnalysis.visible_evidence.map((ev, idx) => (
                      <li key={idx}>{ev}</li>
                    ))}
                  </ul>
                </div>
              )}

              {imageAnalysis.recommendations.length > 0 && (
                <div>
                  <div className="font-semibold text-[#0B3B2E] mb-1">Recommendations:</div>
                  <ul className="list-disc pl-4 space-y-0.5 text-neutral-700">
                    {imageAnalysis.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="text-[11px] text-neutral-500">{imageAnalysis.confidence_note}</div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={handleConfirmDetection}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors ${
                  imageConfirmed
                    ? 'bg-emerald-700 text-white'
                    : 'bg-[#0B3B2E] text-white hover:bg-[#114B3B]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {imageConfirmed ? 'Confirmed — Ready to Submit' : 'Confirm and Continue'}
              </button>
              <button
                type="button"
                onClick={handleIncorrectOrReupload}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white border border-neutral-300 text-neutral-800 rounded-lg hover:bg-neutral-50 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Incorrect Detection / Upload Another Image
              </button>
              {imageConfirmed && (
                <span className="text-xs text-neutral-600">
                  Category synced to {imageAnalysis.mapped_civic_category}. You may still adjust the dropdown above if needed.
                </span>
              )}
            </div>
          </div>
        )}

      {aiPreview && (
        <div className="bg-[#F7F9F8] border border-emerald-200 rounded-xl p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-[#0B3B2E]">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              {aiPreview.modelLabel}
            </span>
            <span className="text-neutral-500 font-mono">{aiPreview.modelSource}</span>
          </div>

          {mlLimitation && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>{mlLimitation}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm pt-1">
            <div>
              <div className="text-xs text-neutral-500">Predicted Category</div>
              <div className="font-semibold text-[#0B3B2E]">{aiPreview.predictedCategory}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Estimated Priority</div>
              <div className="font-semibold text-orange-700">{aiPreview.predictedPriority}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Recommended Department</div>
              <div className="font-semibold text-[#0B3B2E]">{aiPreview.recommendedDepartmentName}</div>
            </div>
          </div>
          <p className="text-xs text-neutral-700 pt-1">{aiPreview.explanation}</p>

          {dupPreview.length > 0 && (
            <div className="mt-3 pt-3 border-t border-emerald-200">
              <div className="text-xs font-semibold text-amber-800 mb-1">
                Potential Nearby Duplicate Reports ({dupPreview.length}) — Kept for Authority Review
              </div>
              <ul className="space-y-1">
                {dupPreview.map((d) => (
                  <li key={d.complaintId} className="text-xs text-neutral-700 flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-amber-700 shrink-0" />
                    <span className="font-mono font-medium">{d.complaintId}</span>
                    <span>·</span>
                    <span className="truncate">{d.title}</span>
                    <span className="text-neutral-500">({d.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || analyzingImage}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors disabled:opacity-60 cursor-pointer"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Saving to Firestore...' : 'Submit Grievance'}
        </button>
      </div>
    </form>
  );
};
