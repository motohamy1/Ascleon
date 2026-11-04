import { z } from 'zod';

export const SourceCategoryEnum = z.enum([
  'lecture_notes',    // Lectures & Handouts (slides, university summaries)
  'textbook',         // Reference Textbooks (Harrison, Robbins, Guyton, etc.)
  'clinical_sheet',   // Clinical Sheets & Bedside Guides (algorithms, pocket cards)
  'guideline_paper',  // Guidelines & Research Papers (ACC/AHA, ESC, NICE, Lancet)
  'exam_review',      // Exam Review & Rapid Recall (First Aid, UWorld notes)
]);

export type SourceCategory = z.infer<typeof SourceCategoryEnum>;

export const PedagogicalStyleEnum = z.enum([
  'foundational_text',
  'bulleted_review',
  'clinical_algorithm',
  'case_oriented',
  'rapid_recall',
]);

export type PedagogicalStyle = z.infer<typeof PedagogicalStyleEnum>;

export const SourceDecisionSchema = z.object({
  category: SourceCategoryEnum.describe('The classified category of the academic or medical study source'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
  domain: z.string().describe('Broad medical or scientific domain (e.g., Cardiology, Pathology, Biochemistry)'),
  subspecialty: z.string().describe('Precise subspecialty (e.g., Interventional Cardiology, Hematopathology)'),
  targetAudience: z.string().describe('Intended level (e.g., Medical Student, Specialist Resident, Fellow)'),
  pedagogicalStyle: PedagogicalStyleEnum.describe('Structural pedagogical layout of the material'),
  estimatedDepth: z.enum(['undergraduate', 'postgraduate_resident', 'fellowship_specialist']).describe('Academic depth level'),
  recommendedEnrichmentSources: z.array(z.string()).describe('Top 2-4 gold-standard reference works in this specific subspecialty'),
  reasoning: z.string().describe('Brief rationale explaining the classification based on document layout and cues'),
});

export type SourceDecision = z.infer<typeof SourceDecisionSchema>;

export const TopicRangeSchema = z.object({
  id: z.string().describe('Unique identifier for this topic section'),
  title: z.string().describe('Canonical topic title (e.g., "Acute Coronary Syndromes: NSTEMI vs STEMI")'),
  startPage: z.number().int().min(1).describe('1-based start page in the source document'),
  endPage: z.number().int().min(1).describe('1-based end page in the source document'),
  keyConcepts: z.array(z.string()).describe('Primary medical/scientific concepts covered'),
  subtopics: z.array(z.string()).default([]).describe('Sub-sections or bullet themes within this range'),
});

export type TopicRange = z.infer<typeof TopicRangeSchema>;

export const BookTopicMapSchema = z.object({
  totalDetectedTopics: z.number().int().min(0),
  topics: z.array(TopicRangeSchema).describe('Complete list of contiguous or high-yield topic sections detected across the source'),
  recommendedStartingTopicId: z.string().optional(),
});

export type BookTopicMap = z.infer<typeof BookTopicMapSchema>;

export const TopicResolutionSchema = z.object({
  resolutionType: z.enum([
    'exact_match',           // Unambiguous topic identified across continuous pages
    'multi_match_ambiguous', // Multiple chapters/sections talk about this topic; user needs to confirm
    'page_range_explicit',   // User gave specific page numbers
    'out_of_scope',          // Topic not found anywhere in the book
  ]),
  matchedTopic: TopicRangeSchema.optional(),
  candidateTopics: z.array(TopicRangeSchema).default([]).describe('List of candidates when ambiguous'),
  startPage: z.number().int().min(1),
  endPage: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
  clarificationQuestion: z.string().optional().describe('Clear, friendly clarification question in the conversation language if ambiguous'),
});

export type TopicResolution = z.infer<typeof TopicResolutionSchema>;

export const MorphJourneyStageSchema = z.object({
  id: z.string(),
  stageNumber: z.number().int().min(1),
  title: z.string().describe('Title of this journey milestone (e.g. "Vascular Endothelial Injury & Plaque Formation")'),
  phase: z.enum([
    'etiology_triggers',
    'cellular_pathology',
    'clinical_presentation',
    'investigations_diagnostics',
    'treatment_algorithm',
    'prognosis_complications',
  ]),
  description: z.string().describe('Narrative clinical explanation of what happens in this stage'),
  keyPathologyPoints: z.array(z.string()).describe('Key mechanistic steps or physiological parameters'),
  interactiveSimulation: z.object({
    simulationType: z.enum([
      'plaque_rupture',
      'flow_pressure',
      'cellular_cascade',
      'ecg_rhythm',
      'anatomical_cross_section',
      'treatment_tree',
      'generic_dynamic_flow',
    ]),
    primaryMetricLabel: z.string().describe('Label of the dynamic parameter slider, e.g. "Stenosis %" or "Serum Troponin"'),
    minMetricValue: z.number().default(0),
    maxMetricValue: z.number().default(100),
    defaultMetricValue: z.number().default(50),
    metricUnit: z.string().default('%'),
    hotspots: z.array(z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      xPercent: z.number().min(0).max(100),
      yPercent: z.number().min(0).max(100),
    })).default([]),
  }),
  checkpoint: z.object({
    prompt: z.string().describe('Clinical checkpoint question to unlock the next step in the journey'),
    options: z.array(z.string()).min(2),
    correctOptionIndex: z.number().int().min(0),
    explanation: z.string(),
  }),
  visualPrompt: z.string().describe('Prompt for generating the accompanying caricature / visual story panel in Ascleon aesthetic'),
});

export type MorphJourneyStage = z.infer<typeof MorphJourneyStageSchema>;

export const MorphJourneySchema = z.object({
  title: z.string(),
  topic: z.string(),
  summary: z.string(),
  estimatedMinutesToExplore: z.number().default(5),
  stages: z.array(MorphJourneyStageSchema).min(1),
});

export type MorphJourney = z.infer<typeof MorphJourneySchema>;
