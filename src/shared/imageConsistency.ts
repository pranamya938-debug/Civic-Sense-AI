import { CivicCategory, ConsistencyStatus, ImageAnalysisResult } from './types';

const CATEGORY_SIGNALS: Array<{ category: CivicCategory; keywords: string[] }> = [
  {
    category: 'Garbage and Waste Management',
    keywords: [
      'garbage',
      'trash',
      'waste',
      'dump',
      'dumping',
      'litter',
      'rubbish',
      'bin',
      'dustbin',
      'plastic',
      'debris',
      'refuse',
    ],
  },
  {
    category: 'Road Damage and Potholes',
    keywords: [
      'pothole',
      'potholes',
      'road',
      'asphalt',
      'crater',
      'tarmac',
      'highway',
      'pavement',
      'carriageway',
      'uneven road',
      'broken road',
    ],
  },
  {
    category: 'Water Supply and Leakage',
    keywords: [
      'water leak',
      'leaking pipe',
      'burst pipe',
      'pipeline',
      'water main',
      'drinking water',
      'hydrant',
      'tap',
      'supply leak',
      'water supply',
    ],
  },
  {
    category: 'Drainage and Sewage',
    keywords: [
      'drain',
      'drainage',
      'sewage',
      'sewer',
      'manhole',
      'stormwater',
      'gutter',
      'culvert',
      'waterlogging',
      'flood',
      'flooding',
      'stagnant',
    ],
  },
  {
    category: 'Streetlight Problems',
    keywords: [
      'streetlight',
      'street light',
      'lamp',
      'lamppost',
      'street lamp',
      'light pole',
      'dark street',
      'bulb',
      'flickering',
      'led pole',
    ],
  },
  {
    category: 'Sanitation',
    keywords: [
      'sanitation',
      'toilet',
      'urinal',
      'hygiene',
      'odor',
      'foul smell',
      'sweeping',
      'cleanliness',
    ],
  },
  {
    category: 'Public Infrastructure',
    keywords: [
      'footpath',
      'sidewalk',
      'park',
      'bench',
      'railing',
      'bus stop',
      'bus shelter',
      'signal',
      'traffic light',
      'signboard',
      'wall',
      'bridge',
      'pole',
    ],
  },
];

function inferMentionedCategories(text: string): CivicCategory[] {
  const lower = text.toLowerCase();
  const matched: CivicCategory[] = [];
  for (const entry of CATEGORY_SIGNALS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      matched.push(entry.category);
    }
  }
  return matched;
}

export interface ConsistencyEvaluation {
  description_consistency: ConsistencyStatus;
  description_consistency_note: string;
  category_consistency: ConsistencyStatus;
  category_consistency_note: string;
}

export function evaluateComplaintConsistency(
  analysis: Pick<
    ImageAnalysisResult,
    | 'relevance_status'
    | 'detected_category'
    | 'mapped_civic_category'
    | 'detected_problem'
    | 'image_quality'
    | 'visible_evidence'
  >,
  context?: {
    title?: string;
    description?: string;
    selectedCategory?: CivicCategory;
  }
): ConsistencyEvaluation {
  const combinedText = `${context?.title || ''} ${context?.description || ''}`.trim();
  const selectedCategory = context?.selectedCategory;

  if (analysis.relevance_status === 'unrelated') {
    return {
      description_consistency: combinedText ? 'mismatch' : 'not_provided',
      description_consistency_note: combinedText
        ? `Mismatch: Uploaded photograph shows a non-civic subject (${analysis.detected_category}) and does not support the complaint description.`
        : 'Uploaded photograph does not depict a recognizable civic issue.',
      category_consistency: selectedCategory ? 'mismatch' : 'not_provided',
      category_consistency_note: selectedCategory
        ? `Mismatch: Photograph is non-civic (${analysis.detected_category}) and does not match selected category "${selectedCategory}".`
        : 'No civic category matched because photograph is unrelated.',
    };
  }

  if (analysis.relevance_status === 'unclear') {
    return {
      description_consistency: combinedText ? 'uncertain' : 'not_provided',
      description_consistency_note: combinedText
        ? `Image quality is ${analysis.image_quality}; photograph clarity is insufficient to verify consistency with the complaint description.`
        : `Image quality is ${analysis.image_quality}; upload a clearer photograph.`,
      category_consistency: selectedCategory ? 'uncertain' : 'not_provided',
      category_consistency_note: selectedCategory
        ? `Cannot confirm whether this unclear photograph matches selected category "${selectedCategory}".`
        : 'Cannot verify category from an unclear photograph.',
    };
  }

  let category_consistency: ConsistencyStatus = 'not_provided';
  let category_consistency_note = 'No category selected for comparison.';
  if (selectedCategory) {
    if (selectedCategory === analysis.mapped_civic_category) {
      category_consistency = 'consistent';
      category_consistency_note = `Consistent: Selected category "${selectedCategory}" matches Gemini visual detection (${analysis.detected_problem}).`;
    } else if (selectedCategory === 'Other Civic Issues') {
      category_consistency = 'uncertain';
      category_consistency_note = `Photograph aligns more specifically with "${analysis.mapped_civic_category}" than "Other Civic Issues".`;
    } else {
      category_consistency = 'mismatch';
      category_consistency_note = `Category mismatch: Photograph depicts "${analysis.mapped_civic_category}" (${analysis.detected_problem}), whereas selected category is "${selectedCategory}".`;
    }
  }

  let description_consistency: ConsistencyStatus = 'not_provided';
  let description_consistency_note =
    'Enter a complaint title and description to verify text-to-image consistency.';

  if (combinedText.length > 0) {
    const mentioned = inferMentionedCategories(combinedText);
    const visualTokens = `${analysis.detected_problem} ${analysis.detected_category} ${analysis.visible_evidence.join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    const lowerText = combinedText.toLowerCase();
    const sharesVisualToken = visualTokens.some((tok) => lowerText.includes(tok));

    if (mentioned.includes(analysis.mapped_civic_category) || sharesVisualToken) {
      description_consistency = 'consistent';
      description_consistency_note = `Consistent: Complaint description aligns with visual evidence (${analysis.detected_problem}).`;
    } else if (mentioned.length > 0 && !mentioned.includes(analysis.mapped_civic_category)) {
      description_consistency = 'mismatch';
      description_consistency_note = `Description mismatch: Complaint text describes ${mentioned.join(' / ')}, whereas the photograph shows ${analysis.mapped_civic_category} (${analysis.detected_problem}).`;
    } else {
      description_consistency = 'uncertain';
      description_consistency_note = `Description does not explicitly reference ${analysis.mapped_civic_category}; confirm that your description matches the photographed issue (${analysis.detected_problem}).`;
    }
  }

  return {
    description_consistency,
    description_consistency_note,
    category_consistency,
    category_consistency_note,
  };
}
