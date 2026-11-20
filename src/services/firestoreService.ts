import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { MUNICIPAL_DEPARTMENTS, MUNICIPAL_WARDS } from '../shared/catalog';
import {
  AccountStatus,
  AiPredictionResult,
  AppNotification,
  AuditLogEntry,
  AuthorityApplication,
  AuthorityApplicationStatus,
  COMPLAINT_STATUSES,
  CivicCategory,
  ComplaintPriority,
  ComplaintRecord,
  ComplaintStatus,
  ComplaintUpdate,
  Department,
  DuplicateCandidate,
  DuplicateMatchRecord,
  ImageAnalysisResult,
  ImageQuality,
  UserProfile,
  UserRole,
  Ward,
  normalizeUserRole,
} from '../shared/types';
import { MapComplaintPoint } from '../components/GisMap';
import { OperationType, db, handleFirestoreError } from './firebaseClient';

function toIso(val: unknown): string {
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function hydrateComplaint(
  id: string,
  d: Record<string, unknown>,
  departments: Department[]
): ComplaintRecord {
  const deptId = d.assignedDepartmentId as string | undefined;
  const dept = departments.find((x) => x.id === deptId);
  return {
    id: (d.id as string) || id,
    citizenId: (d.citizenId as string) || '',
    citizenName: (d.citizenName as string) || 'Citizen',
    title: (d.title as string) || '',
    description: (d.description as string) || '',
    category: ((d.category as CivicCategory) || 'Other Civic Issues') as CivicCategory,
    priority: ((d.priority as ComplaintPriority) || 'Medium') as ComplaintPriority,
    status: ((d.status as ComplaintStatus) || 'Submitted') as ComplaintStatus,
    photoUrl: d.photoUrl as string | undefined,
    latitude: Number(d.latitude || 0),
    longitude: Number(d.longitude || 0),
    address: (d.address as string) || '',
    wardId: (d.wardId as string) || 'ward_14',
    assignedDepartmentId: deptId,
    assignedAuthorityId: d.assignedAuthorityId as string | undefined,
    assignedAuthorityName: d.assignedAuthorityName as string | undefined,
    resolutionNotes: d.resolutionNotes as string | undefined,
    aiPrediction: {
      predictedCategory: ((d.category as CivicCategory) || 'Other Civic Issues') as CivicCategory,
      predictedPriority: ((d.priority as ComplaintPriority) || 'Medium') as ComplaintPriority,
      recommendedDepartmentId: deptId || 'dept_general',
      recommendedDepartmentName: dept?.name || 'General Municipal Grievance Cell',
      modelSource:
        d.aiSource === 'python-fastapi-ml-service'
          ? 'python-fastapi-ml-service'
          : 'demonstration-baseline-classifier',
      modelLabel: (d.aiLabel as string) || 'Baseline Rule Classifier',
      matchedKeywords: [],
      explanation: (d.aiExplanation as string) || '',
    },
    aiDetectedCategory: d.aiDetectedCategory as string | undefined,
    aiDetectedProblem: d.aiDetectedProblem as string | undefined,
    aiImageDescription: d.aiImageDescription as string | undefined,
    aiImageSeverity: d.aiImageSeverity as ComplaintPriority | undefined,
    aiSuggestedDepartment: d.aiSuggestedDepartment as string | undefined,
    aiAnalyzedAt: d.aiAnalyzedAt as string | undefined,
    aiImageQuality: d.aiImageQuality as ImageQuality | undefined,
    aiVisibleEvidence: Array.isArray(d.aiVisibleEvidence)
      ? (d.aiVisibleEvidence as unknown[]).map((x) => String(x))
      : undefined,
    citizenConfirmedCategory:
      typeof d.citizenConfirmedCategory === 'boolean' ? d.citizenConfirmedCategory : undefined,
    potentialDuplicates: [],
    isDemoData: false,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    resolvedAt: d.resolvedAt ? toIso(d.resolvedAt) : undefined,
  };
}

export function subscribeDepartments(onData: (departments: Department[]) => void): () => void {
  if (!db) {
    onData(MUNICIPAL_DEPARTMENTS);
    return () => {};
  }
  const q = query(collection(db, 'departments'), where('active', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(MUNICIPAL_DEPARTMENTS);
        return;
      }
      const list = snap.docs
        .map((s) => {
          const d = s.data();
          return {
            id: (d.id as string) || s.id,
            name: d.name as string,
            code: d.code as string,
            categories: (d.categories as CivicCategory[]) || ['Other Civic Issues'],
            leadOfficer: (d.leadOfficer as string) || 'Unassigned',
            active: d.active !== false,
            createdAt: toIso(d.createdAt),
          } satisfies Department;
        })
        .filter((d) => d.active);
      onData(list.length > 0 ? list : MUNICIPAL_DEPARTMENTS);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'departments')
  );
}

export function subscribeWards(onData: (wards: Ward[]) => void): () => void {
  if (!db) {
    onData(MUNICIPAL_WARDS);
    return () => {};
  }
  const q = query(collection(db, 'wards'), where('active', '==', true));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) {
        onData(MUNICIPAL_WARDS);
        return;
      }
      const list = snap.docs
        .map((s) => {
          const d = s.data();
          return {
            id: (d.id as string) || s.id,
            name: d.name as string,
            zone: d.zone as string,
            centerLat: Number(d.centerLat),
            centerLng: Number(d.centerLng),
            isDemoBoundary: Boolean(d.isDemoBoundary),
            active: d.active !== false,
            createdAt: toIso(d.createdAt),
          } satisfies Ward;
        })
        .filter((w) => w.active);
      onData(list.length > 0 ? list : MUNICIPAL_WARDS);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'wards')
  );
}

export type ScopedGisMarker = MapComplaintPoint & {
  assignedDepartmentId?: string;
  assignedAuthorityId?: string;
  createdAt: string;
  updatedAt: string;
};

function mapGisMarkerDoc(id: string, d: Record<string, unknown>): ScopedGisMarker {
  return {
    id: (d.id as string) || id,
    title: (d.title as string) || '',
    category: (d.category as string) || 'Other Civic Issues',
    priority: (d.priority as ComplaintPriority) || 'Medium',
    status: (d.status as ComplaintStatus) || 'Submitted',
    latitude: Number(d.latitude || 0),
    longitude: Number(d.longitude || 0),
    address: (d.address as string) || '',
    wardId: (d.wardId as string) || 'ward_14',
    assignedDepartmentId: d.assignedDepartmentId as string | undefined,
    assignedAuthorityId: d.assignedAuthorityId as string | undefined,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

export function subscribeGisMarkers(
  onData: (markers: ScopedGisMarker[]) => void
): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'gis_markers'), where('status', 'in', [...COMPLAINT_STATUSES]));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((s) => mapGisMarkerDoc(s.id, s.data()));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'gis_markers')
  );
}

export function subscribeScopedGisMarkers(
  user: UserProfile | null,
  onData: (markers: ScopedGisMarker[]) => void
): () => void {
  if (!db || !user || !user.active) {
    onData([]);
    return () => {};
  }
  if (user.role === 'admin') {
    return subscribeGisMarkers(onData);
  }
  if (user.role !== 'authority' || user.accountStatus !== 'approved') {
    onData([]);
    return () => {};
  }

  const constraints = [];
  if (user.departmentId) {
    constraints.push(where('assignedDepartmentId', '==', user.departmentId));
  }
  if (user.wardId) {
    constraints.push(where('wardId', '==', user.wardId));
  }
  if (constraints.length === 0) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'gis_markers'), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((s) => mapGisMarkerDoc(s.id, s.data()));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'gis_markers')
  );
}

export function subscribeMyComplaints(
  citizenId: string,
  departments: Department[],
  onData: (complaints: ComplaintRecord[]) => void
): () => void {
  if (!db || !citizenId) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'complaints'), where('citizenId', '==', citizenId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((s) => hydrateComplaint(s.id, s.data(), departments));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'complaints')
  );
}

export function subscribeAllComplaints(
  departments: Department[],
  onData: (complaints: ComplaintRecord[]) => void
): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'complaints'),
    (snap) => {
      const list = snap.docs.map((s) => hydrateComplaint(s.id, s.data(), departments));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'complaints')
  );
}

export function subscribeAuthorityComplaints(
  user: UserProfile,
  departments: Department[],
  onData: (complaints: ComplaintRecord[]) => void
): () => void {
  if (!db || !user.active) {
    onData([]);
    return () => {};
  }
  if (user.role === 'admin') {
    return subscribeAllComplaints(departments, onData);
  }
  if (user.role !== 'authority' || user.accountStatus !== 'approved') {
    onData([]);
    return () => {};
  }

  const constraints = [];
  if (user.departmentId) {
    constraints.push(where('assignedDepartmentId', '==', user.departmentId));
  }
  if (user.wardId) {
    constraints.push(where('wardId', '==', user.wardId));
  }
  if (constraints.length === 0) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'complaints'), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((s) => hydrateComplaint(s.id, s.data(), departments));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'complaints')
  );
}

export function subscribeComplaintUpdates(
  complaintId: string,
  onData: (updates: ComplaintUpdate[]) => void
): () => void {
  if (!db || !complaintId) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, 'complaints', complaintId, 'updates'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((s) => {
        const d = s.data();
        return {
          id: (d.id as string) || s.id,
          complaintId: (d.complaintId as string) || complaintId,
          actorId: (d.actorId as string) || '',
          actorName: (d.actorName as string) || 'Staff',
          actorRole: (d.actorRole as UserRole) || 'citizen',
          previousStatus: d.previousStatus as ComplaintStatus | undefined,
          newStatus: (d.newStatus as ComplaintStatus) || 'Submitted',
          remarks: (d.remarks as string) || '',
          createdAt: toIso(d.createdAt),
        } satisfies ComplaintUpdate;
      });
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `complaints/${complaintId}/updates`)
  );
}

export function subscribeMyNotifications(
  recipientId: string,
  onData: (notifications: AppNotification[]) => void
): () => void {
  if (!db || !recipientId) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'notifications'), where('recipientId', '==', recipientId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((s) => {
        const d = s.data();
        return {
          id: (d.id as string) || s.id,
          recipientId: (d.recipientId as string) || recipientId,
          complaintId: d.complaintId as string | undefined,
          title: (d.title as string) || '',
          message: (d.message as string) || '',
          type: (d.type as AppNotification['type']) || 'status',
          read: Boolean(d.read),
          createdAt: toIso(d.createdAt),
        } satisfies AppNotification;
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export function subscribeAuthorityOfficers(
  onData: (officers: UserProfile[]) => void
): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  const q = query(collection(db, 'users'), where('role', '==', 'authority'));
  return onSnapshot(
    q,
    (snap) => {
      const list: UserProfile[] = snap.docs
        .map((s) => {
          const d = s.data();
          return {
            uid: (d.uid as string) || s.id,
            email: '',
            displayName: (d.displayName as string) || s.id,
            role: normalizeUserRole(d.role),
            accountStatus: (d.accountStatus as AccountStatus | undefined) || 'approved',
            departmentId: d.departmentId as string | undefined,
            wardId: d.wardId as string | undefined,
            active: d.active !== false,
            authProvider: 'firebase' as const,
            createdAt: toIso(d.createdAt),
            updatedAt: toIso(d.updatedAt),
          };
        })
        .filter((u) => u.active && u.accountStatus === 'approved');
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'users')
  );
}

export function subscribeUsers(
  isAdminViewer: boolean,
  onData: (users: UserProfile[]) => void
): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  if (!isAdminViewer) {
    return subscribeAuthorityOfficers(onData);
  }
  return onSnapshot(
    collection(db, 'users'),
    async (snap) => {
      const baseUsers: UserProfile[] = snap.docs.map((s) => {
        const d = s.data();
        return {
          uid: (d.uid as string) || s.id,
          email: '',
          displayName: (d.displayName as string) || s.id,
          role: normalizeUserRole(d.role),
          accountStatus: (d.accountStatus as AccountStatus | undefined) || 'active',
          departmentId: d.departmentId as string | undefined,
          wardId: d.wardId as string | undefined,
          designation: d.designation as string | undefined,
          municipality: d.municipality as string | undefined,
          employeeId: d.employeeId as string | undefined,
          approvedBy: d.approvedBy as string | undefined,
          approvedAt: d.approvedAt ? toIso(d.approvedAt) : undefined,
          active: d.active !== false,
          authProvider: 'firebase' as const,
          createdAt: toIso(d.createdAt),
          updatedAt: toIso(d.updatedAt),
        };
      });

      if (db) {
        await Promise.all(
          baseUsers.map(async (u) => {
            try {
              const pSnap = await getDoc(doc(db!, 'users', u.uid, 'private', 'info'));
              if (pSnap.exists()) {
                const pd = pSnap.data();
                u.email = (pd.email as string) || '';
                u.phone = pd.phone as string | undefined;
              }
            } catch {
              // ignore individual private doc read failure
            }
          })
        );
      }

      onData(baseUsers);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'users')
  );
}

export function subscribeDuplicateMatches(
  onData: (matches: DuplicateMatchRecord[]) => void
): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'duplicate_matches'),
    (snap) => {
      const list = snap.docs.map((s) => {
        const d = s.data();
        return {
          id: (d.id as string) || s.id,
          sourceComplaintId: (d.sourceComplaintId as string) || '',
          matchedComplaintId: (d.matchedComplaintId as string) || '',
          sourceTitle: (d.sourceTitle as string) || '',
          matchedTitle: (d.matchedTitle as string) || '',
          similarityReason: (d.similarityReason as string) || '',
          distanceMeters: Number(d.distanceMeters || 0),
          reviewStatus: (d.reviewStatus as DuplicateMatchRecord['reviewStatus']) || 'pending_review',
          reviewedBy: d.reviewedBy as string | undefined,
          createdAt: toIso(d.createdAt),
        } satisfies DuplicateMatchRecord;
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'duplicate_matches')
  );
}

export function subscribeAuditLogs(onData: (logs: AuditLogEntry[]) => void): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'audit_logs'),
    (snap) => {
      const list = snap.docs.map((s) => {
        const d = s.data();
        return {
          id: (d.id as string) || s.id,
          actorId: (d.actorId as string) || '',
          actorName: (d.actorName as string) || 'Staff',
          actorRole: (d.actorRole as UserRole) || 'admin',
          action: (d.action as string) || '',
          targetType: (d.targetType as AuditLogEntry['targetType']) || 'complaint',
          targetId: (d.targetId as string) || '',
          details: (d.details as string) || '',
          createdAt: toIso(d.createdAt),
        } satisfies AuditLogEntry;
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
  );
}

function mapAuthorityApplicationDoc(
  id: string,
  d: Record<string, unknown>
): AuthorityApplication {
  return {
    id: (d.id as string) || id,
    uid: (d.uid as string) || id,
    fullName: (d.fullName as string) || '',
    officialEmail: (d.officialEmail as string) || '',
    contactNumber: (d.contactNumber as string) || '',
    employeeId: (d.employeeId as string) || '',
    designation: (d.designation as string) || '',
    municipality: (d.municipality as string) || '',
    departmentId: (d.departmentId as string) || '',
    departmentName: (d.departmentName as string) || '',
    wardId: (d.wardId as string) || '',
    wardName: (d.wardName as string) || '',
    verificationDocUrl: d.verificationDocUrl as string | undefined,
    verificationDocName: d.verificationDocName as string | undefined,
    emailVerified: Boolean(d.emailVerified),
    status: (d.status as AuthorityApplicationStatus) || 'pending_verification',
    submittedAt: toIso(d.submittedAt),
    updatedAt: toIso(d.updatedAt),
    reviewedBy: d.reviewedBy as string | undefined,
    reviewedByName: d.reviewedByName as string | undefined,
    reviewedAt: d.reviewedAt ? toIso(d.reviewedAt) : undefined,
    rejectionReason: d.rejectionReason as string | undefined,
  };
}

export function subscribeAuthorityApplications(
  onData: (applications: AuthorityApplication[]) => void
): () => void {
  if (!db) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, 'authority_applications'),
    (snap) => {
      const list = snap.docs.map((s) => mapAuthorityApplicationDoc(s.id, s.data()));
      list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'authority_applications')
  );
}

export function subscribeMyAuthorityApplication(
  uid: string,
  onData: (application: AuthorityApplication | null) => void
): () => void {
  if (!db || !uid) {
    onData(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'authority_applications', uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(mapAuthorityApplicationDoc(snap.id, snap.data()));
    },
    (err) => handleFirestoreError(err, OperationType.GET, `authority_applications/${uid}`)
  );
}

export async function submitComplaintToFirestore(params: {
  citizen: UserProfile;
  title: string;
  description: string;
  category: CivicCategory;
  address: string;
  wardId: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  aiPrediction: AiPredictionResult;
  imageAnalysis?: ImageAnalysisResult | null;
  citizenConfirmedCategory?: boolean;
  duplicates: DuplicateCandidate[];
}): Promise<ComplaintRecord> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');

  const id = `CS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const complaintPayload: Record<string, unknown> = {
    id,
    citizenId: params.citizen.uid,
    citizenName: params.citizen.displayName.slice(0, 120),
    title: params.title.trim().slice(0, 160),
    description: params.description.trim().slice(0, 2000),
    category: params.category,
    priority: params.aiPrediction.predictedPriority,
    status: 'Submitted',
    latitude: params.latitude,
    longitude: params.longitude,
    address: params.address.trim().slice(0, 280),
    wardId: params.wardId.slice(0, 64),
    assignedDepartmentId: params.aiPrediction.recommendedDepartmentId,
    aiSource: params.aiPrediction.modelSource.slice(0, 80),
    aiLabel: params.aiPrediction.modelLabel.slice(0, 120),
    aiExplanation: params.aiPrediction.explanation.slice(0, 500),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.photoUrl && params.photoUrl.length <= 500) {
    complaintPayload.photoUrl = params.photoUrl;
  }
  if (params.imageAnalysis) {
    const img = params.imageAnalysis;
    complaintPayload.aiDetectedCategory = img.detected_category.slice(0, 120);
    complaintPayload.aiDetectedProblem = img.detected_problem.slice(0, 160);
    complaintPayload.aiImageDescription = img.description.slice(0, 500);
    complaintPayload.aiImageSeverity = img.severity;
    complaintPayload.aiSuggestedDepartment = img.suggested_department.slice(0, 120);
    complaintPayload.aiAnalyzedAt = img.analyzed_at.slice(0, 64);
    complaintPayload.aiImageQuality = img.image_quality;
    if (Array.isArray(img.visible_evidence)) {
      complaintPayload.aiVisibleEvidence = img.visible_evidence
        .map((e) => String(e).slice(0, 140))
        .slice(0, 8);
    }
  }
  if (typeof params.citizenConfirmedCategory === 'boolean') {
    complaintPayload.citizenConfirmedCategory = params.citizenConfirmedCategory;
  }

  // Step 1: Write parent complaint document first so exists() security checks pass cleanly
  try {
    await setDoc(doc(db, 'complaints', id), complaintPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `complaints/${id}`);
  }

  // Step 2: Write GIS marker, initial timeline update, notification, and any duplicate flags
  const batch = writeBatch(db);
  batch.set(doc(db, 'gis_markers', id), {
    id,
    title: complaintPayload.title,
    category: params.category,
    priority: params.aiPrediction.predictedPriority,
    status: 'Submitted',
    latitude: params.latitude,
    longitude: params.longitude,
    address: complaintPayload.address,
    wardId: complaintPayload.wardId,
    assignedDepartmentId: params.aiPrediction.recommendedDepartmentId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const updId = `upd_${Date.now()}`;
  batch.set(doc(db, 'complaints', id, 'updates', updId), {
    id: updId,
    complaintId: id,
    complaintCitizenId: params.citizen.uid,
    actorId: params.citizen.uid,
    actorName: params.citizen.displayName.slice(0, 120),
    actorRole: params.citizen.role,
    newStatus: 'Submitted',
    remarks: `Submitted by ${params.citizen.displayName}. Recommended department: ${params.aiPrediction.recommendedDepartmentName}.`,
    createdAt: serverTimestamp(),
  });

  const notifId = `notif_${Date.now()}`;
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: params.citizen.uid,
    complaintId: id,
    title: `Complaint ${id} Submitted`,
    message: `Classified as ${params.category} (${params.aiPrediction.predictedPriority} priority). Recommended dept: ${params.aiPrediction.recommendedDepartmentName}.`,
    type: 'submission',
    read: false,
    createdAt: serverTimestamp(),
  });

  for (const cand of params.duplicates.slice(0, 2)) {
    const matchId = `dup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    batch.set(doc(db, 'duplicate_matches', matchId), {
      id: matchId,
      sourceComplaintId: id,
      matchedComplaintId: cand.complaintId,
      sourceTitle: String(complaintPayload.title).slice(0, 160),
      matchedTitle: cand.title.slice(0, 160),
      similarityReason: cand.reason.slice(0, 300),
      distanceMeters: cand.distanceMeters,
      reviewStatus: 'pending_review',
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `gis_markers/${id} | complaints/${id}/updates`);
  }

  const nowIso = new Date().toISOString();
  return {
    id,
    citizenId: params.citizen.uid,
    citizenName: params.citizen.displayName,
    title: params.title.trim(),
    description: params.description.trim(),
    category: params.category,
    priority: params.aiPrediction.predictedPriority,
    status: 'Submitted',
    photoUrl: params.photoUrl,
    latitude: params.latitude,
    longitude: params.longitude,
    address: params.address.trim(),
    wardId: params.wardId,
    assignedDepartmentId: params.aiPrediction.recommendedDepartmentId,
    aiPrediction: params.aiPrediction,
    potentialDuplicates: params.duplicates,
    isDemoData: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export async function assignComplaintInFirestore(params: {
  complaint: ComplaintRecord;
  department: Department;
  officerUid: string;
  officerName: string;
  actor: UserProfile;
  remarks?: string;
}): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const { complaint, department, officerUid, officerName, actor, remarks } = params;
  const previousStatus = complaint.status;
  const nextStatus: ComplaintStatus =
    complaint.status === 'Submitted' || complaint.status === 'Under Review'
      ? 'Assigned'
      : complaint.status;
  const remarkText = (
    remarks?.trim() || `Assigned to ${department.name} (${officerName}).`
  ).slice(0, 1000);

  const batch = writeBatch(db);
  batch.update(doc(db, 'complaints', complaint.id), {
    assignedDepartmentId: department.id,
    assignedAuthorityId: officerUid,
    assignedAuthorityName: officerName.slice(0, 120),
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'gis_markers', complaint.id), {
    assignedDepartmentId: department.id,
    assignedAuthorityId: officerUid,
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });

  const updId = `upd_${Date.now()}`;
  batch.set(doc(db, 'complaints', complaint.id, 'updates', updId), {
    id: updId,
    complaintId: complaint.id,
    complaintCitizenId: complaint.citizenId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: actor.role,
    previousStatus,
    newStatus: nextStatus,
    remarks: remarkText,
    createdAt: serverTimestamp(),
  });

  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: actor.role === 'admin' ? 'admin' : 'authority',
    action: 'COMPLAINT_ASSIGNED',
    targetType: 'complaint',
    targetId: complaint.id,
    details: `Assigned to ${department.name} / Officer ${officerName}`.slice(0, 500),
    createdAt: serverTimestamp(),
  });

  const notifId = `notif_${Date.now()}`;
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: complaint.citizenId,
    complaintId: complaint.id,
    title: `${complaint.id} assigned to ${department.name}`.slice(0, 140),
    message: remarkText.slice(0, 400),
    type: 'assignment',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaint.id}`);
  }
}

export async function updateComplaintStatusInFirestore(params: {
  complaint: ComplaintRecord;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  remarks?: string;
  resolutionNotes?: string;
  actor: UserProfile;
}): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const { complaint, status, priority, remarks, resolutionNotes, actor } = params;
  const previousStatus = complaint.status;
  const remarkText = (
    remarks?.trim() ||
    resolutionNotes?.trim() ||
    `Status updated from ${previousStatus} to ${status}.`
  ).slice(0, 1000);

  const complaintPatch: Record<string, unknown> = {
    status,
    priority,
    updatedAt: serverTimestamp(),
  };
  if (typeof resolutionNotes === 'string' && resolutionNotes.trim()) {
    complaintPatch.resolutionNotes = resolutionNotes.trim().slice(0, 1000);
  }
  if (status === 'Resolved') {
    complaintPatch.resolvedAt = serverTimestamp();
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'complaints', complaint.id), complaintPatch);
  batch.update(doc(db, 'gis_markers', complaint.id), {
    status,
    priority,
    updatedAt: serverTimestamp(),
  });

  const updId = `upd_${Date.now()}`;
  batch.set(doc(db, 'complaints', complaint.id, 'updates', updId), {
    id: updId,
    complaintId: complaint.id,
    complaintCitizenId: complaint.citizenId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: actor.role,
    previousStatus,
    newStatus: status,
    remarks: remarkText,
    createdAt: serverTimestamp(),
  });

  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: actor.role === 'admin' ? 'admin' : 'authority',
    action: 'COMPLAINT_STATUS_UPDATED',
    targetType: 'complaint',
    targetId: complaint.id,
    details: `${previousStatus} -> ${status}: ${remarkText}`.slice(0, 500),
    createdAt: serverTimestamp(),
  });

  const notifId = `notif_${Date.now()}`;
  batch.set(doc(db, 'notifications', notifId), {
    id: notifId,
    recipientId: complaint.citizenId,
    complaintId: complaint.id,
    title: `${complaint.id} is now ${status}`.slice(0, 140),
    message: remarkText.slice(0, 400),
    type: status === 'Resolved' ? 'resolution' : 'status',
    read: false,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaint.id}`);
  }
}

export async function reviewDuplicateMatchInFirestore(
  match: DuplicateMatchRecord,
  reviewStatus: 'confirmed_duplicate' | 'dismissed',
  actor: UserProfile
): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const batch = writeBatch(db);
  batch.update(doc(db, 'duplicate_matches', match.id), {
    reviewStatus,
    reviewedBy: actor.displayName.slice(0, 120),
  });
  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: actor.role === 'admin' ? 'admin' : 'authority',
    action: 'DUPLICATE_MATCH_REVIEWED',
    targetType: 'duplicate',
    targetId: match.id,
    details: `Marked ${match.sourceComplaintId} vs ${match.matchedComplaintId} as ${reviewStatus}`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `duplicate_matches/${match.id}`);
  }
}

export async function updateUserByAdminInFirestore(
  target: UserProfile,
  patch: { role?: UserRole; active?: boolean; departmentId?: string; wardId?: string },
  actor: UserProfile
): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const normalizedRole = patch.role ? normalizeUserRole(patch.role) : undefined;
  const userPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (normalizedRole) userPatch.role = normalizedRole;
  if (typeof patch.active === 'boolean') userPatch.active = patch.active;
  if (patch.departmentId !== undefined) userPatch.departmentId = patch.departmentId.slice(0, 64);
  if (patch.wardId !== undefined) userPatch.wardId = patch.wardId.slice(0, 64);

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', target.uid), userPatch);

  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: 'admin',
    action: 'USER_ACCOUNT_UPDATED',
    targetType: 'user',
    targetId: target.uid,
    details: `Updated ${target.displayName}: role=${patch.role || target.role}, active=${
      typeof patch.active === 'boolean' ? patch.active : target.active
    }`.slice(0, 500),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${target.uid}`);
  }
}

export async function createDepartmentInFirestore(
  input: { name: string; code: string; leadOfficer?: string },
  actor: UserProfile
): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const id = `dept_${Date.now().toString(36)}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'departments', id), {
    id,
    name: input.name.trim().slice(0, 120),
    code: input.code.trim().toUpperCase().slice(0, 24),
    leadOfficer: (input.leadOfficer || 'Unassigned').trim().slice(0, 120),
    categories: ['Other Civic Issues'],
    active: true,
    createdAt: serverTimestamp(),
  });
  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: 'admin',
    action: 'DEPARTMENT_CREATED',
    targetType: 'department',
    targetId: id,
    details: `Created department ${input.name.trim()} (${input.code.trim().toUpperCase()})`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `departments/${id}`);
  }
}

export async function createWardInFirestore(
  input: { name: string; zone: string; centerLat: number; centerLng: number },
  actor: UserProfile
): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const id = `ward_${Date.now().toString(36)}`;
  const batch = writeBatch(db);
  batch.set(doc(db, 'wards', id), {
    id,
    name: input.name.trim().slice(0, 120),
    zone: input.zone.trim().slice(0, 64),
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    isDemoBoundary: true,
    active: true,
    createdAt: serverTimestamp(),
  });
  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: 'admin',
    action: 'WARD_CREATED',
    targetType: 'ward',
    targetId: id,
    details: `Created ward ${input.name.trim()} (${input.zone.trim()})`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `wards/${id}`);
  }
}

export async function syncReferenceCatalogToFirestore(actor: UserProfile): Promise<void> {
  if (!db) throw new Error('Cloud Firestore is not initialized.');
  const existingDepts = await Promise.all(
    MUNICIPAL_DEPARTMENTS.map((dept) => getDoc(doc(db!, 'departments', dept.id)))
  );
  const existingWards = await Promise.all(
    MUNICIPAL_WARDS.map((ward) => getDoc(doc(db!, 'wards', ward.id)))
  );

  const batch = writeBatch(db);
  MUNICIPAL_DEPARTMENTS.forEach((dept, idx) => {
    const ref = doc(db!, 'departments', dept.id);
    if (existingDepts[idx].exists()) {
      batch.update(ref, {
        name: dept.name,
        code: dept.code,
        categories: dept.categories,
        leadOfficer: dept.leadOfficer,
        active: true,
      });
    } else {
      batch.set(ref, {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        categories: dept.categories,
        leadOfficer: dept.leadOfficer,
        active: true,
        createdAt: serverTimestamp(),
      });
    }
  });
  MUNICIPAL_WARDS.forEach((ward, idx) => {
    const ref = doc(db!, 'wards', ward.id);
    if (existingWards[idx].exists()) {
      batch.update(ref, {
        name: ward.name,
        zone: ward.zone,
        centerLat: ward.centerLat,
        centerLng: ward.centerLng,
        isDemoBoundary: ward.isDemoBoundary,
        active: true,
      });
    } else {
      batch.set(ref, {
        id: ward.id,
        name: ward.name,
        zone: ward.zone,
        centerLat: ward.centerLat,
        centerLng: ward.centerLng,
        isDemoBoundary: ward.isDemoBoundary,
        active: true,
        createdAt: serverTimestamp(),
      });
    }
  });
  const auditId = `audit_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditId), {
    id: auditId,
    actorId: actor.uid,
    actorName: actor.displayName.slice(0, 120),
    actorRole: 'admin',
    action: 'REFERENCE_CATALOG_SYNCED',
    targetType: 'department',
    targetId: 'municipal_catalog',
    details: 'Synchronized standard municipal departments and wards into Cloud Firestore.',
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'departments | wards');
  }
}

export async function markNotificationReadInFirestore(notificationId: string): Promise<void> {
  if (!db) return;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsReadInFirestore(
  notifications: AppNotification[]
): Promise<void> {
  if (!db) return;
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  const batch = writeBatch(db);
  for (const n of unread) {
    batch.update(doc(db, 'notifications', n.id), { read: true });
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}
