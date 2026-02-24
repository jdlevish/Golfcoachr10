export type CoachConstraintKey =
  | 'direction_consistency'
  | 'distance_control'
  | 'bag_gapping'
  | 'strike_quality';

export type CoachConfidenceLevel = 'low' | 'medium' | 'high';

export type ConstraintScore = {
  key: CoachConstraintKey;
  label: string;
  score: number;
  reasons: string[];
  focusClub: string | null;
  targetMetric: string;
  currentValue: number | null;
  targetValue: number | null;
};

export type CoachConfidence = {
  level: CoachConfidenceLevel;
  score: number;
  shotsAnalyzed: number;
  clubsAnalyzed: number;
  sessionsAnalyzed: number;
  reasons: string[];
};

export type PracticePlanStep = {
  title: string;
  reps: string;
  objective: string;
};

export type PracticePlan = {
  durationMinutes: number;
  focus: string;
  goal: string;
  steps: PracticePlanStep[];
};

export type CoachV2Plan = {
  version: 2;
  generatedAt: string;
  constraintScores: ConstraintScore[];
  primaryConstraint: ConstraintScore;
  secondaryConstraint: ConstraintScore | null;
  confidence: CoachConfidence;
  practicePlan: PracticePlan;
  trendSummary: string;
};
