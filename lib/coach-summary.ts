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

const debugEnabled = () => process.env.OPENAI_DEBUG_LOGS === '1';

const debugLog = (message: string, meta?: Record<string, unknown>) => {
  if (!debugEnabled()) return;
  if (meta) {
    console.info(`[coach-summary] ${message}`, meta);
    return;
  }
  console.info(`[coach-summary] ${message}`);
};

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const extractOutputText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;

  const direct = (payload as { output_text?: string }).output_text;
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
      const maybeText = (part as { text?: unknown }).text;
      if (typeof maybeText === 'string' && maybeText.trim()) {
        chunks.push(maybeText.trim());
      }
    }
  }

  if (!chunks.length) return null;
  return chunks.join('\n\n');
};

const callOpenAI = async (input: CoachSummaryInput): Promise<CoachSummaryResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  if (!apiKey) {
    debugLog('OPENAI_API_KEY missing, using deterministic fallback.');
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

  const body = {
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
  };

  const startedAt = Date.now();
  debugLog('Sending request to OpenAI Responses API.', {
    model,
    tone: input.tone,
    detailLevel: input.detailLevel
  });

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    const parsedPayload = safeJsonParse(responseText);

    debugLog('Received OpenAI response.', {
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt
    });

    if (!response.ok) {
      debugLog('OpenAI returned non-OK status, falling back.', {
        status: response.status,
        body: typeof parsedPayload === 'object' && parsedPayload ? parsedPayload : responseText.slice(0, 600)
      });
      return {
        summary: buildDeterministicSummary(input),
        source: 'deterministic'
      };
    }

    const outputText = extractOutputText(parsedPayload);
    if (!outputText) {
      debugLog('No summary text found in OpenAI payload, falling back.', {
        bodyPreview:
          typeof parsedPayload === 'object' && parsedPayload ? parsedPayload : responseText.slice(0, 600)
      });
      return {
        summary: buildDeterministicSummary(input),
        source: 'deterministic'
      };
    }

    debugLog('Using LLM summary output.', {
      chars: outputText.length
    });

    return {
      summary: outputText,
      source: 'llm',
      model
    };
  } catch (error) {
    debugLog('OpenAI request threw an error, falling back.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      summary: buildDeterministicSummary(input),
      source: 'deterministic'
    };
  }
};

export const generateCoachSummary = async (input: CoachSummaryInput): Promise<CoachSummaryResult> =>
  callOpenAI(input);
