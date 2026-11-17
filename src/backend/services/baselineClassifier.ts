import {
  AiPredictionResult,
  CIVIC_CATEGORIES,
  CivicCategory,
  ComplaintPriority,
  ComplaintRecord,
  DuplicateCandidate,
} from '../../shared/types.ts';

const CATEGORY_KEYWORDS: Record<CivicCategory, string[]> = {
  'Garbage and Waste Management': [
    'garbage', 'trash', 'waste', 'dumping', 'litter', 'bin', 'dustbin',
    'compactor', 'plastic', 'debris', 'rubbish', 'collection', 'overflowing',
  ],
  'Road Damage and Potholes': [
    'pothole', 'road', 'asphalt', 'crater', 'pavement', 'footpath', 'sidewalk',
    'crack', 'tar', 'speedbreaker', 'divider', 'carriageway', 'manhole', 'crossing',
  ],
  'Water Supply and Leakage': [
    'water', 'leak', 'leakage', 'pipe', 'pipeline', 'burst', 'supply',
    'tap', 'contamination', 'pressure', 'valve', 'drinking',
  ],
  'Drainage and Sewage': [
    'drain', 'drainage', 'sewage', 'sewer', 'gutter', 'culvert', 'flooding',
    'waterlogging', 'stormwater', 'clogged', 'blocked drain',
  ],
  'Streetlight Problems': [
    'streetlight', 'light', 'lamp', 'pole', 'dark', 'flickering', 'bulb',
    'led', 'wiring', 'blackout', 'unlit',
  ],
  Sanitation: [
    'sanitation', 'toilet', 'urinal', 'hygiene', 'stench', 'foul smell',
    'mosquito', 'sweeping', 'cleaning', 'disinfection',
  ],
  'Public Infrastructure': [
    'park', 'bench', 'bus stop', 'shelter', 'bridge', 'railing', 'signboard',
    'public building', 'wall', 'fence', 'playground', 'civic center',
  ],
  'Other Civic Issues': [],
};

const DEPARTMENT_ROUTING: Record<CivicCategory, { id: string; name: string }> = {
  'Garbage and Waste Management': { id: 'dept_swm', name: 'Solid Waste Management' },
  'Road Damage and Potholes': { id: 'dept_roads', name: 'Roads & Public Works' },
  'Water Supply and Leakage': { id: 'dept_water', name: 'Water Supply Board' },
  'Drainage and Sewage': { id: 'dept_drainage', name: 'Stormwater & Sewerage' },
  'Streetlight Problems': { id: 'dept_elec', name: 'Street Lighting & Electrical' },
  Sanitation: { id: 'dept_sanitation', name: 'Public Health & Sanitation' },
  'Public Infrastructure': { id: 'dept_infra', name: 'Civic Infrastructure & Parks' },
  'Other Civic Issues': { id: 'dept_general', name: 'General Municipal Grievance Cell' },
};

const CRITICAL_TERMS = [
  'live wire', 'electrocution', 'collapsed', 'sinkhole', 'hospital',
  'school gate', 'raw sewage', 'drinking water contamination', 'flooding',
  'major burst', 'accident', 'toxic', 'emergency', 'fire hazard',
];

const HIGH_TERMS = [
  'overflowing', 'blocked', 'broken', 'dark', 'deep pothole',
  'leakage', 'days', 'main road', 'highway', 'junction', 'foul smell', 'unlit',
];

const LOW_TERMS = ['minor', 'paint', 'faded', 'trimming', 'small crack', 'cosmetic'];

function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2));
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  ta.forEach((tok) => {
    if (tb.has(tok)) intersection += 1;
  });
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function runBaselineClassifier(
  title: string,
  description: string,
  userCategory?: string
): AiPredictionResult {
  const combined = `${title} ${description}`.toLowerCase();
  let predictedCategory: CivicCategory = 'Other Civic Issues';
  let bestMatches: string[] = [];

  for (const cat of CIVIC_CATEGORIES) {
    if (cat === 'Other Civic Issues') continue;
    const matches = CATEGORY_KEYWORDS[cat].filter((kw) => combined.includes(kw));
    if (matches.length > bestMatches.length) {
      bestMatches = matches;
      predictedCategory = cat;
    }
  }

  let catExplanation = '';
  if (bestMatches.length === 0 && userCategory && CIVIC_CATEGORIES.includes(userCategory as CivicCategory)) {
    predictedCategory = userCategory as CivicCategory;
    catExplanation = `Retained citizen-selected category '${predictedCategory}' because no distinct domain keywords matched.`;
  } else if (bestMatches.length > 0) {
    catExplanation = `Matched domain keywords (${bestMatches.slice(0, 4).join(', ')}) pointing to ${predictedCategory}.`;
  } else {
    catExplanation = 'Assigned to Other Civic Issues pending manual officer triage.';
  }

  let predictedPriority: ComplaintPriority = 'Medium';
  let priExplanation = 'Assigned standard Medium operational priority.';

  const critHits = CRITICAL_TERMS.filter((t) => combined.includes(t));
  const highHits = HIGH_TERMS.filter((t) => combined.includes(t));
  const lowHits = LOW_TERMS.filter((t) => combined.includes(t));

  if (critHits.length > 0) {
    predictedPriority = 'Critical';
    priExplanation = `Flagged Critical due to high-hazard terms: ${critHits.slice(0, 3).join(', ')}.`;
  } else if (
    highHits.length > 0 ||
    predictedCategory === 'Water Supply and Leakage' ||
    predictedCategory === 'Drainage and Sewage'
  ) {
    predictedPriority = 'High';
    priExplanation =
      highHits.length > 0
        ? `Elevated to High priority (${highHits.slice(0, 3).join(', ')}).`
        : `Elevated to High priority due to essential utility category (${predictedCategory}).`;
  } else if (lowHits.length > 0) {
    predictedPriority = 'Low';
    priExplanation = `Estimated Low priority (${lowHits.slice(0, 2).join(', ')}).`;
  }

  const dept = DEPARTMENT_ROUTING[predictedCategory] || DEPARTMENT_ROUTING['Other Civic Issues'];

  return {
    predictedCategory,
    predictedPriority,
    recommendedDepartmentId: dept.id,
    recommendedDepartmentName: dept.name,
    modelSource: 'demonstration-baseline-classifier',
    modelLabel: 'Demonstration Baseline Classifier (Rule + Lexical Heuristic)',
    matchedKeywords: bestMatches,
    explanation: `${catExplanation} ${priExplanation}`,
  };
}

export function detectBaselineDuplicates(
  input: { title: string; description: string; category: CivicCategory; latitude: number; longitude: number },
  existing: ComplaintRecord[]
): DuplicateCandidate[] {
  const sourceText = `${input.title} ${input.description}`;
  const candidates: DuplicateCandidate[] = [];
  const thirtyDaysMs = 30 * 24 * 3600 * 1000;
  const now = Date.now();

  for (const item of existing) {
    if (item.status === 'Rejected') continue;
    const ageMs = now - new Date(item.createdAt).getTime();
    if (ageMs > thirtyDaysMs) continue;

    const dist = Math.round(haversineMeters(input.latitude, input.longitude, item.latitude, item.longitude));
    const sim = Number(jaccardSimilarity(sourceText, `${item.title} ${item.description}`).toFixed(2));
    const sameCategory = item.category === input.category;

    if ((dist <= 350 && sameCategory) || (dist <= 600 && sim >= 0.28) || sim >= 0.45) {
      candidates.push({
        complaintId: item.id,
        title: item.title,
        category: item.category,
        status: item.status,
        distanceMeters: dist,
        textSimilarityScore: sim,
        reason: `${dist}m away · ${item.category} · lexical overlap ${Math.round(sim * 100)}%`,
        createdAt: item.createdAt,
      });
    }
  }

  return candidates.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 5);
}
