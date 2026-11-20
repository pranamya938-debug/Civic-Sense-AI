export type UserRole = 'citizen' | 'authority' | 'admin' | 'system';

export function normalizeUserRole(raw: unknown): UserRole {
  if (raw === 'admin' || raw === 'administrator') return 'admin';
  if (raw === 'authority') return 'authority';
  if (raw === 'system') return 'system';
  return 'citizen';
}

export type CivicCategory =
  | 'Garbage and Waste Management'
  | 'Road Damage and Potholes'
  | 'Water Supply and Leakage'
  | 'Drainage and Sewage'
  | 'Streetlight Problems'
  | 'Sanitation'
  | 'Public Infrastructure'
  | 'Other Civic Issues';

export const CIVIC_CATEGORIES: CivicCategory[] = [
  'Garbage and Waste Management',
  'Road Damage and Potholes',
  'Water Supply and Leakage',
  'Drainage and Sewage',
  'Streetlight Problems',
  'Sanitation',
  'Public Infrastructure',
  'Other Civic Issues',
];

export type ComplaintPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type ComplaintStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Rejected';

export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
];

export type AiModelSource =
  | 'python-fastapi-ml-service'
  | 'demonstration-baseline-classifier';

export type AccountStatus =
  | 'active'
  | 'pending_verification'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type AuthorityApplicationStatus =
  | 'pending_verification'
  | 'approved'
  | 'rejected'
  | 'suspended';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  accountStatus?: AccountStatus;
  departmentId?: string;
  wardId?: string;
  designation?: string;
  municipality?: string;
  employeeId?: string;
  approvedBy?: string;
  approvedAt?: string;
  emailVerified?: boolean;
  phone?: string;
  active: boolean;
  authProvider: 'firebase';
  createdAt: string;
  updatedAt: string;
}

export interface AuthorityApplication {
  id: string;
  uid: string;
  fullName: string;
  officialEmail: string;
  contactNumber: string;
  employeeId: string;
  designation: string;
  municipality: string;
  departmentId: string;
  departmentName: string;
  wardId: string;
  wardName: string;
  verificationDocUrl?: string;
  verificationDocName?: string;
  emailVerified: boolean;
  status: AuthorityApplicationStatus;
  submittedAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  categories: CivicCategory[];
  leadOfficer: string;
  active: boolean;
  createdAt: string;
}

export interface Ward {
  id: string;
  name: string;
  zone: string;
  centerLat: number;
  centerLng: number;
  isDemoBoundary: boolean;
  active: boolean;
  createdAt: string;
}

export interface CategoryConfig {
  id: string;
  name: CivicCategory;
  defaultDepartmentId: string;
  slaHours: number;
  active: boolean;
}

export interface AiPredictionResult {
  predictedCategory: CivicCategory;
  predictedPriority: ComplaintPriority;
  recommendedDepartmentId: string;
  recommendedDepartmentName: string;
  modelSource: AiModelSource;
  modelLabel: string;
  matchedKeywords: string[];
  explanation: string;
}

export interface DuplicateCandidate {
  complaintId: string;
  title: string;
  category: CivicCategory;
  status: ComplaintStatus;
  distanceMeters: number;
  textSimilarityScore: number;
  reason: string;
  createdAt: string;
}

export interface DuplicateMatchRecord {
  id: string;
  sourceComplaintId: string;
  matchedComplaintId: string;
  sourceTitle: string;
  matchedTitle: string;
  similarityReason: string;
  distanceMeters: number;
  reviewStatus: 'pending_review' | 'confirmed_duplicate' | 'dismissed';
  reviewedBy?: string;
  createdAt: string;
}

export interface ComplaintUpdate {
  id: string;
  complaintId: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  previousStatus?: ComplaintStatus;
  newStatus: ComplaintStatus;
  remarks: string;
  createdAt: string;
}

export type ImageRelevanceStatus = 'relevant' | 'unrelated' | 'unclear' | 'uncertain';
export type ImageQuality = 'Good' | 'Poor' | 'Unclear';
export type ConsistencyStatus = 'consistent' | 'mismatch' | 'uncertain' | 'not_provided';

export interface ImageAnalysisResult {
  is_civic_issue: boolean;
  relevance_status: ImageRelevanceStatus;
  detected_category: string;
  mapped_civic_category: CivicCategory;
  detected_problem: string;
  description: string;
  severity: ComplaintPriority;
  confidence: number;
  confidence_note: string;
  visible_evidence: string[];
  suggested_department: string;
  suggested_department_id: string;
  image_quality: ImageQuality;
  recommendations: string[];
  description_consistency: ConsistencyStatus;
  description_consistency_note: string;
  category_consistency: ConsistencyStatus;
  category_consistency_note: string;
  analyzed_at: string;
  model_used: string;
}

export interface ComplaintRecord {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  category: CivicCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  photoUrl?: string;
  latitude: number;
  longitude: number;
  address: string;
  wardId: string;
  assignedDepartmentId?: string;
  assignedAuthorityId?: string;
  assignedAuthorityName?: string;
  resolutionNotes?: string;
  aiPrediction: AiPredictionResult;
  aiDetectedCategory?: string;
  aiDetectedProblem?: string;
  aiImageDescription?: string;
  aiImageSeverity?: ComplaintPriority;
  aiSuggestedDepartment?: string;
  aiAnalyzedAt?: string;
  aiImageQuality?: ImageQuality;
  aiVisibleEvidence?: string[];
  citizenConfirmedCategory?: boolean;
  potentialDuplicates: DuplicateCandidate[];
  isDemoData: boolean;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  complaintId?: string;
  title: string;
  message: string;
  type: 'submission' | 'status' | 'assignment' | 'resolution' | 'info_requested' | 'authority_verification';
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType:
    | 'complaint'
    | 'user'
    | 'department'
    | 'ward'
    | 'category'
    | 'duplicate'
    | 'demo_data'
    | 'authority_application';
  targetId: string;
  details: string;
  createdAt: string;
}

export interface AnalyticsOverview {
  totalComplaints: number;
  pendingCount: number;
  underReviewCount: number;
  assignedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  rejectedCount: number;
  highPriorityCount: number;
  criticalPriorityCount: number;
  resolutionRatePercent: number;
  avgResolutionHours: number;
  containsDemoData: boolean;
  byCategory: { category: string; count: number; resolved: number }[];
  byPriority: { priority: ComplaintPriority; count: number }[];
  byStatus: { status: ComplaintStatus; count: number }[];
  byWard: { wardId: string; wardName: string; count: number; resolved: number }[];
  byDepartment: {
    departmentId: string;
    departmentName: string;
    assigned: number;
    resolved: number;
    avgHours: number;
  }[];
  dailyTrend: { date: string; submitted: number; resolved: number }[];
}
