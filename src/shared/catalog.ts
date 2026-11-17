import {
  AnalyticsOverview,
  CIVIC_CATEGORIES,
  COMPLAINT_STATUSES,
  CategoryConfig,
  ComplaintPriority,
  ComplaintRecord,
  Department,
  Ward,
} from './types';

export const MUNICIPAL_DEPARTMENTS: Department[] = [
  {
    id: 'dept_swm',
    name: 'Solid Waste Management',
    code: 'SWM-01',
    categories: ['Garbage and Waste Management'],
    leadOfficer: 'Raghavendra Kulkarni',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_roads',
    name: 'Roads & Public Works',
    code: 'RPW-02',
    categories: ['Road Damage and Potholes'],
    leadOfficer: 'Vikram Desai',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_water',
    name: 'Water Supply Board',
    code: 'WSB-03',
    categories: ['Water Supply and Leakage'],
    leadOfficer: 'Sunita Menon',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_drainage',
    name: 'Stormwater & Sewerage',
    code: 'SWS-04',
    categories: ['Drainage and Sewage'],
    leadOfficer: 'Arvind Chatterjee',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_elec',
    name: 'Street Lighting & Electrical',
    code: 'SLE-05',
    categories: ['Streetlight Problems'],
    leadOfficer: 'Karthik Subramanian',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_sanitation',
    name: 'Public Health & Sanitation',
    code: 'PHS-06',
    categories: ['Sanitation'],
    leadOfficer: 'Dr. Kavita Nair',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_infra',
    name: 'Civic Infrastructure & Parks',
    code: 'CIP-07',
    categories: ['Public Infrastructure'],
    leadOfficer: 'Prakash Verma',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'dept_general',
    name: 'General Municipal Grievance Cell',
    code: 'GMG-08',
    categories: ['Other Civic Issues'],
    leadOfficer: 'Meera Iyer',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const MUNICIPAL_WARDS: Ward[] = [
  {
    id: 'ward_14',
    name: 'Ward 14 — Indiranagar East',
    zone: 'East Zone',
    centerLat: 12.9784,
    centerLng: 77.6408,
    isDemoBoundary: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ward_22',
    name: 'Ward 22 — Koramangala South',
    zone: 'South Zone',
    centerLat: 12.9352,
    centerLng: 77.6245,
    isDemoBoundary: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ward_08',
    name: 'Ward 08 — Malleswaram West',
    zone: 'West Zone',
    centerLat: 13.0031,
    centerLng: 77.5643,
    isDemoBoundary: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ward_31',
    name: 'Ward 31 — Jayanagar Central',
    zone: 'South Zone',
    centerLat: 12.925,
    centerLng: 77.5938,
    isDemoBoundary: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ward_45',
    name: 'Ward 45 — Whitefield Corridor',
    zone: 'East Zone',
    centerLat: 12.9698,
    centerLng: 77.7499,
    isDemoBoundary: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ward_19',
    name: 'Ward 19 — Hebbal Lakefront',
    zone: 'North Zone',
    centerLat: 13.0358,
    centerLng: 77.597,
    isDemoBoundary: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export const MUNICIPAL_CATEGORIES: CategoryConfig[] = [
  { id: 'cat_swm', name: 'Garbage and Waste Management', defaultDepartmentId: 'dept_swm', slaHours: 24, active: true },
  { id: 'cat_roads', name: 'Road Damage and Potholes', defaultDepartmentId: 'dept_roads', slaHours: 72, active: true },
  { id: 'cat_water', name: 'Water Supply and Leakage', defaultDepartmentId: 'dept_water', slaHours: 18, active: true },
  { id: 'cat_drainage', name: 'Drainage and Sewage', defaultDepartmentId: 'dept_drainage', slaHours: 24, active: true },
  { id: 'cat_lights', name: 'Streetlight Problems', defaultDepartmentId: 'dept_elec', slaHours: 36, active: true },
  { id: 'cat_sanitation', name: 'Sanitation', defaultDepartmentId: 'dept_sanitation', slaHours: 24, active: true },
  { id: 'cat_infra', name: 'Public Infrastructure', defaultDepartmentId: 'dept_infra', slaHours: 96, active: true },
  { id: 'cat_other', name: 'Other Civic Issues', defaultDepartmentId: 'dept_general', slaHours: 72, active: true },
];

export interface AnalyticsSourceItem {
  id: string;
  category: string;
  priority: ComplaintPriority;
  status: ComplaintRecord['status'];
  wardId?: string;
  assignedDepartmentId?: string;
  createdAt: string;
  resolvedAt?: string;
  updatedAt?: string;
}

export function computeAnalyticsOverview(
  list: AnalyticsSourceItem[],
  departments: Department[],
  wards: Ward[]
): AnalyticsOverview {
  const totalComplaints = list.length;
  const pendingCount = list.filter((c) => c.status === 'Submitted').length;
  const underReviewCount = list.filter((c) => c.status === 'Under Review').length;
  const assignedCount = list.filter((c) => c.status === 'Assigned').length;
  const inProgressCount = list.filter((c) => c.status === 'In Progress').length;
  const resolvedList = list.filter((c) => c.status === 'Resolved');
  const resolvedCount = resolvedList.length;
  const rejectedCount = list.filter((c) => c.status === 'Rejected').length;
  const highPriorityCount = list.filter((c) => c.priority === 'High').length;
  const criticalPriorityCount = list.filter((c) => c.priority === 'Critical').length;

  const resolutionRatePercent = totalComplaints > 0 ? Math.round((resolvedCount / totalComplaints) * 100) : 0;

  let totalResHours = 0;
  let resWithTimes = 0;
  for (const c of resolvedList) {
    const endIso = c.resolvedAt || c.updatedAt;
    if (endIso) {
      const hrs = (new Date(endIso).getTime() - new Date(c.createdAt).getTime()) / 3600000;
      if (hrs >= 0 && Number.isFinite(hrs)) {
        totalResHours += hrs;
        resWithTimes += 1;
      }
    }
  }
  const avgResolutionHours = resWithTimes > 0 ? Number((totalResHours / resWithTimes).toFixed(1)) : 0;

  const byCategory = CIVIC_CATEGORIES.map((category) => {
    const matching = list.filter((c) => c.category === category);
    return {
      category,
      count: matching.length,
      resolved: matching.filter((c) => c.status === 'Resolved').length,
    };
  });

  const priorities: ComplaintPriority[] = ['Critical', 'High', 'Medium', 'Low'];
  const byPriority = priorities.map((priority) => ({
    priority,
    count: list.filter((c) => c.priority === priority).length,
  }));

  const byStatus = COMPLAINT_STATUSES.map((status) => ({
    status,
    count: list.filter((c) => c.status === status).length,
  }));

  const byWard = wards.map((w) => {
    const matching = list.filter((c) => c.wardId === w.id);
    return {
      wardId: w.id,
      wardName: w.name,
      count: matching.length,
      resolved: matching.filter((c) => c.status === 'Resolved').length,
    };
  });

  const byDepartment = departments.map((d) => {
    const matching = list.filter((c) => c.assignedDepartmentId === d.id);
    const deptResolved = matching.filter((c) => c.status === 'Resolved' && (c.resolvedAt || c.updatedAt));
    const avgHrs =
      deptResolved.length > 0
        ? Number(
            (
              deptResolved.reduce((acc, c) => {
                const endIso = c.resolvedAt || c.updatedAt || c.createdAt;
                return acc + Math.max(0, (new Date(endIso).getTime() - new Date(c.createdAt).getTime()) / 3600000);
              }, 0) / deptResolved.length
            ).toFixed(1)
          )
        : 0;
    return {
      departmentId: d.id,
      departmentName: d.name,
      assigned: matching.length,
      resolved: matching.filter((c) => c.status === 'Resolved').length,
      avgHours: avgHrs,
    };
  });

  const dailyMap = new Map<string, { submitted: number; resolved: number }>();
  for (let i = 9; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
    dailyMap.set(day, { submitted: 0, resolved: 0 });
  }
  for (const c of list) {
    const subDay = c.createdAt.slice(0, 10);
    if (dailyMap.has(subDay)) dailyMap.get(subDay)!.submitted += 1;
    if (c.status === 'Resolved') {
      const resDay = (c.resolvedAt || c.updatedAt || c.createdAt).slice(0, 10);
      if (dailyMap.has(resDay)) dailyMap.get(resDay)!.resolved += 1;
    }
  }
  const dailyTrend = Array.from(dailyMap.entries()).map(([date, vals]) => ({
    date,
    submitted: vals.submitted,
    resolved: vals.resolved,
  }));

  return {
    totalComplaints,
    pendingCount,
    underReviewCount,
    assignedCount,
    inProgressCount,
    resolvedCount,
    rejectedCount,
    highPriorityCount,
    criticalPriorityCount,
    resolutionRatePercent,
    avgResolutionHours,
    containsDemoData: false,
    byCategory,
    byPriority,
    byStatus,
    byWard,
    byDepartment,
    dailyTrend,
  };
}
