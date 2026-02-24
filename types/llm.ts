export type CoachDrillRecommendation = {
  name: string;
  youtubeUrl: string;
  why: string;
};

export type CoachSummaryInput = {
  tone: 'straight' | 'encouraging' | 'technical';
  detailLevel: 'concise' | 'balanced' | 'deep';
  primaryConstraint: string;
  secondaryConstraint: string | null;
  confidence: {
    level: 'low' | 'medium' | 'high';
    score: number;
  };
  target: string;
  trendSummary: string;
  topInsights: Array<{
    title: string;
    ifThen: string;
    evidence: string;
    action: string;
  }>;
};

export type CoachSummaryResult = {
  summary: string;
  recommendedDrills: CoachDrillRecommendation[];
  source: 'llm' | 'deterministic';
  model?: string;
};
