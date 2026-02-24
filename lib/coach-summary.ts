import type { CoachDrillRecommendation, CoachSummaryInput, CoachSummaryResult } from '@/types/llm';

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

const isYouTubeUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host.endsWith('.youtube.com')
    );
  } catch {
    return false;
  }
};

const extractYouTubeVideoId = (value: string) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.replace('/', '').trim();
      return id || null;
    }
    if (host.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return id;
      const shortsMatch = parsed.pathname.match(/\/shorts\/([^/?]+)/i);
      if (shortsMatch?.[1]) return shortsMatch[1];
    }
    return null;
  } catch {
    return null;
  }
};

const youtubeSearchLink = (query: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

const buildDeterministicDrills = (input: CoachSummaryInput): CoachDrillRecommendation[] => {
  const key = input.primaryConstraint.toLowerCase();
  if (key.includes('direction')) {
    return [
      {
        name: 'Alignment stick start-line gate',
        youtubeUrl: youtubeSearchLink('golf alignment stick start line drill'),
        why: 'Tightens initial face direction and reduces offline spread.'
      },
      {
        name: '9-to-3 face control drill',
        youtubeUrl: youtubeSearchLink('golf 9 to 3 face control drill'),
        why: 'Builds face awareness without full-swing variability.'
      },
      {
        name: 'Random target dispersion challenge',
        youtubeUrl: youtubeSearchLink('golf random target dispersion drill'),
        why: 'Transfers direction control into target-switching conditions.'
      }
    ];
  }

  if (key.includes('distance')) {
    return [
      {
        name: 'Stock carry ladder drill',
        youtubeUrl: youtubeSearchLink('golf stock carry ladder distance control drill'),
        why: 'Improves carry window consistency.'
      },
      {
        name: 'Tempo metronome wedge/iron drill',
        youtubeUrl: youtubeSearchLink('golf tempo metronome drill irons'),
        why: 'Reduces strike timing variance.'
      },
      {
        name: 'Distance calibration challenge',
        youtubeUrl: youtubeSearchLink('golf distance calibration range drill'),
        why: 'Reinforces precise carry targets under pressure.'
      }
    ];
  }

  if (key.includes('gapping')) {
    return [
      {
        name: 'Two-club gapping retest protocol',
        youtubeUrl: youtubeSearchLink('golf club gapping range session drill'),
        why: 'Validates spacing around flagged overlaps or cliffs.'
      },
      {
        name: 'Alternating neighbor-club test',
        youtubeUrl: youtubeSearchLink('golf alternating clubs gapping drill'),
        why: 'Improves confidence in club separation decisions.'
      },
      {
        name: 'Median carry verification routine',
        youtubeUrl: youtubeSearchLink('golf carry distance consistency drill'),
        why: 'Anchors gapping decisions to playable stock shots.'
      }
    ];
  }

  return [
    {
      name: 'Centered-contact strike pattern drill',
      youtubeUrl: youtubeSearchLink('golf centered contact drill irons'),
      why: 'Improves strike quality and predictable launch conditions.'
    },
    {
      name: 'Speed consistency block',
      youtubeUrl: youtubeSearchLink('golf swing speed consistency drill'),
      why: 'Reduces speed spikes that hurt dispersion and carry control.'
    },
    {
      name: 'Pressure transfer set',
      youtubeUrl: youtubeSearchLink('golf pressure practice drill range'),
      why: 'Builds repeatability when targets change.'
    }
  ];
};

const sanitizeDrills = (drills: unknown): CoachDrillRecommendation[] => {
  if (!Array.isArray(drills)) return [];
  const accepted: CoachDrillRecommendation[] = [];
  for (const drill of drills) {
    if (!drill || typeof drill !== 'object') continue;
    const name = (drill as { name?: unknown }).name;
    const youtubeUrl = (drill as { youtube_url?: unknown }).youtube_url;
    const why = (drill as { why?: unknown }).why;
    if (typeof name !== 'string' || !name.trim()) continue;
    if (typeof youtubeUrl !== 'string' || !isYouTubeUrl(youtubeUrl)) continue;
    if (typeof why !== 'string' || !why.trim()) continue;
    accepted.push({
      name: name.trim().slice(0, 120),
      youtubeUrl: youtubeUrl.trim(),
      why: why.trim().slice(0, 240)
    });
    if (accepted.length >= 3) break;
  }
  return accepted;
};

const verifyYouTubeVideoAvailability = async (url: string) => {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    // Search/result links are considered valid fallbacks.
    return true;
  }

  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;
  try {
    const response = await fetch(oembedUrl, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
};

const ensureLiveYouTubeLinks = async (
  drills: CoachDrillRecommendation[],
  input: CoachSummaryInput
): Promise<CoachDrillRecommendation[]> => {
  const validated = await Promise.all(
    drills.map(async (drill) => {
      const available = await verifyYouTubeVideoAvailability(drill.youtubeUrl);
      if (available) return drill;
      return {
        ...drill,
        youtubeUrl: youtubeSearchLink(`${drill.name} golf drill ${input.primaryConstraint}`)
      };
    })
  );
  return validated;
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

const extractJsonFromText = (value: string): unknown => {
  const direct = safeJsonParse(value);
  if (direct) return direct;

  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const parsed = safeJsonParse(fencedMatch[1]);
    if (parsed) return parsed;
  }

  const firstBrace = value.indexOf('{');
  const lastBrace = value.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = value.slice(firstBrace, lastBrace + 1);
    return safeJsonParse(candidate);
  }

  return null;
};

const callOpenAI = async (input: CoachSummaryInput): Promise<CoachSummaryResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  if (!apiKey) {
    debugLog('OPENAI_API_KEY missing, using deterministic fallback.');
    return {
      summary: buildDeterministicSummary(input),
      recommendedDrills: buildDeterministicDrills(input),
      source: 'deterministic'
    };
  }

  const systemPrompt =
    'You are a data-driven golf coach assistant. Use only provided metrics/insights. Avoid generic swing tips and medical claims.';
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
        content: [
          {
            type: 'input_text',
            text:
              `${systemPrompt} ${detailInstruction} ` +
              'Return valid JSON only with keys: summary, recommended_drills. recommended_drills must be an array of 2-3 drills, each with keys name, youtube_url, why. youtube_url must be a full YouTube URL.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text:
              `Create a personalized coaching summary and drill recommendations from this JSON:\n${JSON.stringify(input)}\n` +
              'Important: choose drills specific to the primary constraint and include only YouTube links.'
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
        recommendedDrills: buildDeterministicDrills(input),
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
        recommendedDrills: buildDeterministicDrills(input),
        source: 'deterministic'
      };
    }

    const parsedJson = extractJsonFromText(outputText);
    let summaryText: string | null = null;
    let recommendedDrills: CoachDrillRecommendation[] = [];

    if (parsedJson && typeof parsedJson === 'object') {
      const parsedSummary = (parsedJson as { summary?: unknown }).summary;
      if (typeof parsedSummary === 'string' && parsedSummary.trim()) {
        summaryText = parsedSummary.trim();
      }
      recommendedDrills = sanitizeDrills((parsedJson as { recommended_drills?: unknown }).recommended_drills);
    }

    if (!summaryText) {
      // Backward-compatible fallback when model responds in plain text.
      summaryText = outputText.trim();
    }
    if (!recommendedDrills.length) {
      recommendedDrills = buildDeterministicDrills(input);
    }
    recommendedDrills = await ensureLiveYouTubeLinks(recommendedDrills, input);

    debugLog('Using LLM summary output.', {
      chars: summaryText.length,
      drillRecommendations: recommendedDrills.length
    });

    return {
      summary: summaryText,
      recommendedDrills,
      source: 'llm',
      model
    };
  } catch (error) {
    debugLog('OpenAI request threw an error, falling back.', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      summary: buildDeterministicSummary(input),
      recommendedDrills: buildDeterministicDrills(input),
      source: 'deterministic'
    };
  }
};

export const generateCoachSummary = async (input: CoachSummaryInput): Promise<CoachSummaryResult> =>
  callOpenAI(input);
