import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Cpu,
  Crosshair,
  Loader2,
  MapPin,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  AiPredictionResult,
  CIVIC_CATEGORIES,
  CivicCategory,
  ComplaintRecord,
  DuplicateCandidate,
  Ward,
} from '../shared/types';
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

export const ComplaintForm: React.FC<ComplaintFormProps> = ({ wards, onSubmitted }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CivicCategory>('Road Damage and Potholes');
  const [autoClassify, setAutoClassify] = useState(true);
  const [address, setAddress] = useState('');
  const [wardId, setWardId] = useState(wards[0]?.id || 'ward_14');
  const [latitude, setLatitude] = useState(wards[0]?.centerLat ?? 12.9784);
  const [longitude, setLongitude] = useState(wards[0]?.centerLng ?? 77.6408);
  const [photoPreviewDataUrl, setPhotoPreviewDataUrl] = useState<string>('');
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<AiPredictionResult | null>(null);
  const [mlLimitation, setMlLimitation] = useState<string | null>(null);
  const [aiServiceStatus, setAiServiceStatus] = useState<{
    pythonServiceReachable: boolean;
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
      activeMode: string;
      limitationNotice: string | null;
    }>('/api/ai/status')
      .then(setAiServiceStatus)
      .catch(() => setAiServiceStatus(null));
  }, []);

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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_900_000) {
      setError('Please select a JPEG, PNG, or WEBP image smaller than 1.9 MB.');
      return;
    }
    setError(null);
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') {
        setUploadingPhoto(false);
        return;
      }
      const dataUrl = reader.result;
      setPhotoPreviewDataUrl(dataUrl);
      try {
        const res = await apiRequest<{ photoUrl: string }>('/api/uploads', {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        });
        setUploadedPhotoUrl(res.photoUrl);
      } catch (err) {
        setPhotoPreviewDataUrl('');
        setUploadedPhotoUrl('');
        setError(err instanceof Error ? err.message : 'Photograph upload failed.');
      } finally {
        setUploadingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
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
        }),
      });
      setAiPreview(res.prediction);
      setDupPreview(res.duplicates || []);
      setMlLimitation(res.limitationNotice);
      if (autoClassify) {
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
    if (uploadingPhoto) {
      setError('Please wait for the photograph upload to complete.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const analysis = await apiRequest<AiAnalyzeResponse>('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          latitude: Number(latitude),
          longitude: Number(longitude),
        }),
      });

      const resolvedCategory: CivicCategory = autoClassify
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
        photoUrl: uploadedPhotoUrl || undefined,
        aiPrediction: analysis.prediction,
        duplicates: analysis.duplicates || [],
      });

      setTitle('');
      setDescription('');
      setAddress('');
      setPhotoPreviewDataUrl('');
      setUploadedPhotoUrl('');
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
            Provide issue details, upload evidence, and pin GPS coordinates. Records are stored persistently in Cloud Firestore.
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
            <strong>Baseline Classifier Active:</strong>{' '}
            {aiServiceStatus.limitationNotice ||
              'Python FastAPI ML service is temporarily disconnected. Complaints are automatically triaged using the rule-based baseline classifier.'}
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
                onChange={(e) => setCategory(e.target.value as CivicCategory)}
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
                  onChange={(e) => setAutoClassify(e.target.checked)}
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
              Site Photograph (JPEG/PNG/WEBP, max 1.9 MB)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer">
                {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {uploadingPhoto ? 'Uploading Photo...' : 'Upload Photograph'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void handlePhotoUpload(e)}
                  className="hidden"
                />
              </label>
              {uploadedPhotoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreviewDataUrl('');
                    setUploadedPhotoUrl('');
                  }}
                  className="text-xs text-red-700 hover:underline cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            {(photoPreviewDataUrl || uploadedPhotoUrl) && (
              <div className="mt-3 w-48 h-28 rounded-lg overflow-hidden border border-neutral-200">
                <img
                  src={photoPreviewDataUrl || uploadedPhotoUrl}
                  alt="Complaint evidence preview"
                  className="w-full h-full object-cover"
                />
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
          disabled={submitting || uploadingPhoto}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0B3B2E] text-white rounded-lg hover:bg-[#114B3B] transition-colors disabled:opacity-60 cursor-pointer"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Saving to Firestore...' : 'Submit Grievance'}
        </button>
      </div>
    </form>
  );
};
