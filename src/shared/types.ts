export type UserRole = 'citizen' | 'authority' | 'admin';

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

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentId?: string;
  wardId?: string;
  phone?: string;
  active: boolean;
  authProvider: 'firebase';
  createdAt: string;
  updatedAt: string;
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
  type: 'submission' | 'status' | 'assignment' | 'resolution' | 'info_requested';
  read: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: 'complaint' | 'user' | 'department' | 'ward' | 'category' | 'duplicate' | 'demo_data';
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
