import type { CoachSummaryInput, CoachSummaryResult } from '@/types/llm';

const buildDeterministicSummary = (input: CoachSummaryInput) => {
  const insightLine = input.topInsights[0]
    ? `${input.topInsights[0].title}: ${input.topInsights[0].ifThen}`
    : 'No major rule alerts triggered this session.';
  const tonePrefix =
    input.tone === 'straight'
      ? 'Direct take'
      : input.tone === 'technical'
        ? 'Technical take'
        : 'Coach take';

  return `${tonePrefix}: your primary limiter is ${input.primaryConstraint.toLowerCase()} with ${input.confidence.level} confidence (${input.confidence.score}/100). ${input.trendSummary} Target: ${input.target}. ${insightLine}`;
};

const callOpenAI = async (input: CoachSummaryInput): Promise<CoachSummaryResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  if (!apiKey) {
    return {
      summary: buildDeterministicSummary(input),
      source: 'deterministic'
    };
  }

  const systemPrompt =
    'You are a data-driven golf coach assistant. Use only the provided metrics and insights. Avoid generic swing tips, avoid medical claims, and keep recommendations specific and actionable.';
  const detailInstruction =
    input.detailLevel === 'concise'
      ? 'Respond in 2-3 sentences.'
      : input.detailLevel === 'deep'
        ? 'Respond in 5-7 sentences with one concrete session plan emphasis.'
        : 'Respond in 3-5 sentences.';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: `${systemPrompt} ${detailInstruction}` }]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Create a personalized coaching summary from this JSON:\n${JSON.stringify(input)}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    return {
      summary: buildDeterministicSummary(input),
      source: 'deterministic'
    };
  }

  const payload = (await response.json()) as { output_text?: string };
  const outputText = payload.output_text?.trim();
  if (!outputText) {
    return {
      summary: buildDeterministicSummary(input),
      source: 'deterministic'
    };
  }

  return {
    summary: outputText,
    source: 'llm',
    model
  };
};

export const generateCoachSummary = async (input: CoachSummaryInput): Promise<CoachSummaryResult> =>
  callOpenAI(input);
