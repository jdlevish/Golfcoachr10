export type TrendDirection = 'improved' | 'worsened' | 'flat' | 'insufficient';

export type MetricDelta = {
  key: string;
  label: string;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  direction: TrendDirection;
  unit: string;
};

export type ConstraintDelta = {
  label: string;
  currentScore: number;
  baselineScore: number;
  deltaScore: number;
  direction: TrendDirection;
};

export type TrendDeltas = {
  baselineSessions: number;
  hasBaseline: boolean;
  metrics: MetricDelta[];
  primaryConstraintDelta: ConstraintDelta | null;
  summary: string;
};

export type RuleInsightSeverity = 'info' | 'warning' | 'danger';

export type RuleInsight = {
  id: string;
  severity: RuleInsightSeverity;
  title: string;
  ifThen: string;
  evidence: string;
  action: string;
};
