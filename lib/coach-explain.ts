import type { CoachDiagnosis } from '@/lib/coach-diagnosis';
import type { MissPatternSummary } from '@/lib/r10';

export type CoachExplainTone = 'encouraging' | 'technical' | 'direct';

export type CoachExplainInput = {
  diagnosis: CoachDiagnosis;
  missPattern: MissPatternSummary;
  userTone: CoachExplainTone;
};

export type CoachExplainOutput = {
  summary: string;
  whyThisHappens: string;
  whatToDoNext: string;
  onCourseTip: string;
  source: 'llm' | 'deterministic';
  model?: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const toJson = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const safeParseJson = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const extractOutputText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) chunks.push(text.trim());
    }
  }
  return chunks.length ? chunks.join('\n\n') : null;
};

const extractJson = (value: string): unknown => {
  const direct = safeParseJson(value);
  if (direct) return direct;

  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = safeParseJson(fenced[1]);
    if (parsed) return parsed;
  }

  const first = value.indexOf('{');
  const last = value.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const parsed = safeParseJson(value.slice(first, last + 1));
    if (parsed) return parsed;
  }
  return null;
};

const deterministicExplain = (input: CoachExplainInput): CoachExplainOutput => {
  const primary = input.diagnosis.primary;
  const keyMetricEntries = Object.entries(primary.keyMetrics)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => `${key}=${round2(value as number)}`);
  const keyMetricsText = keyMetricEntries.length ? keyMetricEntries.join(', ') : 'limited metric availability';

  const topShapePct = input.missPattern.distribution[input.missPattern.topShape] ?? 0;
  const tonePrefix =
    input.userTone === 'technical'
      ? 'Technical read'
      : input.userTone === 'direct'
        ? 'Direct read'
        : 'Coach read';

  const summary =
    `${tonePrefix}: primary constraint is ${primary.constraintType} on ${primary.club}. ` +
    `Severity score=${round2(primary.severityScore)} with metrics ${keyMetricsText}. ` +
    `Most common miss is ${input.missPattern.topShape} at ${round2(topShapePct)}% (severe offline ${round2(
      input.missPattern.severePct
    )}%).`;

  const whyThisHappens =
    `This pattern is likely driven by ${primary.constraintType} variance measured by ${keyMetricsText}. ` +
    `Miss distribution indicates ${input.missPattern.topShape} is dominant (${round2(topShapePct)}%).`;

  const whatToDoNext =
    `Focus today on reducing the primary metric by 15-20% over the next 3 sessions. ` +
    `Track ${keyMetricEntries[0] ?? 'primary metric'} after each practice block and retest miss-shape distribution.`;

  const onCourseTip =
    input.missPattern.topShape.includes('Push')
      ? 'Aim strategy: start from safer center-left targets to account for right-start misses while you retrain start-line.'
      : input.missPattern.topShape.includes('Pull')
        ? 'Aim strategy: favor center-right targets and commit to one alignment checkpoint before each shot.'
        : 'Aim strategy: play stock target lines and prioritize tempo/commitment over extra speed.';

  return {
    summary,
    whyThisHappens,
    whatToDoNext,
    onCourseTip,
    source: 'deterministic'
  };
};

const sanitizeOutput = (parsed: unknown): Omit<CoachExplainOutput, 'source' | 'model'> | null => {
  if (!parsed || typeof parsed !== 'object') return null;
  const summary = (parsed as { summary?: unknown }).summary;
  const whyThisHappens = (parsed as { whyThisHappens?: unknown }).whyThisHappens;
  const whatToDoNext = (parsed as { whatToDoNext?: unknown }).whatToDoNext;
  const onCourseTip = (parsed as { onCourseTip?: unknown }).onCourseTip;
  if (
    typeof summary !== 'string' ||
    typeof whyThisHappens !== 'string' ||
    typeof whatToDoNext !== 'string' ||
    typeof onCourseTip !== 'string'
  ) {
    return null;
  }
  return {
    summary: summary.trim(),
    whyThisHappens: whyThisHappens.trim(),
    whatToDoNext: whatToDoNext.trim(),
    onCourseTip: onCourseTip.trim()
  };
};

export const generateCoachExplanation = async (input: CoachExplainInput): Promise<CoachExplainOutput> => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  if (!apiKey) {
    return deterministicExplain(input);
  }

  const system =
    'You are a golf coach. Use only provided metrics. If info is missing say so. No medical claims.';
  const body = {
    model,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              `${system} Return strict JSON with keys: summary, whyThisHappens, whatToDoNext, onCourseTip. ` +
              'You must cite numeric metrics from the input and never invent numbers.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Explain this session from structured metrics only:\n${toJson(input)}`
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      return deterministicExplain(input);
    }
    const payloadText = await response.text();
    const payload = safeParseJson(payloadText);
    const outputText = extractOutputText(payload);
    if (!outputText) return deterministicExplain(input);
    const parsed = sanitizeOutput(extractJson(outputText));
    if (!parsed) return deterministicExplain(input);
    return {
      ...parsed,
      source: 'llm',
      model
    };
  } catch {
    return deterministicExplain(input);
  }
};
