// Vercel serverless function: transcribes a short field-dictation recording and
// maps it onto ONE inspection's checklist. Holds the OpenAI + Anthropic API
// keys server-side — the rest of this app talks to Supabase directly from the
// browser with a public key, but a transcription/LLM key can never live there.
//
// Contract:
//   POST { inspectionType: 'door' | 'ceiling' | 'damper',
//          audioBase64: string (no "data:" prefix), mimeType: string,
//          candidates: Array<{ id: string; label: string; section?: string }> }
//   -> { transcript: string,
//        matches: Array<{ id: string; note?: string; status?: string; priority?: string }>,
//        category?: string, status?: string }
//
// `candidates` is the checklist to match against for THIS inspection — the
// door wizard's current branch-logic items, the ceiling finding catalog, or
// the damper deficiency list. The server has no static knowledge of any of
// them; it only ever sees what the client sends for this one recording, so it
// never has to be kept in sync with lib/inspectionRules.ts, ceilingFindings.ts,
// or damperChecklist.ts.
//
// No SDK dependency: OpenAI's Whisper endpoint and Anthropic's Messages
// endpoint are both plain REST, and Node's built-in fetch/FormData/Blob (both
// present in Vercel's Node runtime) are enough to call them directly. Uses the
// classic (req, res) handler signature — Vercel's default Node.js runtime for
// api/*.ts — rather than the newer Web Fetch (Request/Response) signature, so
// it needs no @vercel/node types package and no runtime-version assumptions.

import type { IncomingMessage, ServerResponse } from 'http';

// Vercel's Node.js runtime is the default for anything under api/ that isn't
// marked Edge, and it auto-parses a JSON request body into req.body — no
// @vercel/node types package needed for that, just the two fields used below.
interface VercelLikeRequest extends IncomingMessage {
  method?: string;
  body?: any;
}
interface VercelLikeResponse extends ServerResponse {
  status(code: number): VercelLikeResponse;
  json(body: unknown): void;
}

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

// A stuck "recording" (or a client bug) shouldn't be able to run up an
// unbounded bill — refuse anything absurdly large for a per-zone dictation.
const MAX_AUDIO_BASE64_CHARS = 15_000_000; // ~11MB decoded, generous for a few minutes of compressed speech

interface Candidate {
  id: string;
  label: string;
  section?: string;
}

interface DictateRequest {
  inspectionType: 'door' | 'ceiling' | 'damper';
  audioBase64: string;
  mimeType: string;
  candidates: Candidate[];
}

interface MatchOut {
  id: string;
  note?: string;
  status?: string;
  priority?: string;
}

async function transcribe(audioBase64: string, mimeType: string, apiKey: string): Promise<string> {
  const bytes = Buffer.from(audioBase64, 'base64');
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'ogg';
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), `dictation.${ext}`);
  form.append('model', 'whisper-1');
  // Bias transcription toward the vocabulary these recordings actually use.
  form.append('prompt', 'fire door, smoke damper, gasket, vision panel, astragal, sweep, hinge, closer, panic hardware, latch, threshold, penetration, sprinkler, egress');

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text || '';
}

// Builds the tool-use schema + instructions for the mapping call. Kept
// type-specific here (rather than one generic shape) since what "a match"
// means genuinely differs: a door item has a compliance status, a ceiling
// finding has a priority, a damper deficiency has neither on its own.
function buildTool(inspectionType: DictateRequest['inspectionType']) {
  if (inspectionType === 'door') {
    return {
      name: 'apply_door_findings',
      description: 'Report which door checklist items the dictated transcript addressed, and how.',
      input_schema: {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'The checklist item id from the candidate list.' },
                status: { type: 'string', enum: ['deficient', 'advisory', 'compliant'] },
                note: { type: 'string', description: 'Short note capturing what the inspector said about this item, if anything beyond the status.' },
              },
              required: ['id', 'status'],
            },
          },
        },
        required: ['matches'],
      },
    };
  }
  if (inspectionType === 'ceiling') {
    return {
      name: 'apply_ceiling_findings',
      description: 'Report which ceiling findings the dictated transcript described.',
      input_schema: {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'The finding id from the candidate list.' },
                priority: { type: 'string', enum: ['Priority 1', 'Priority 2', 'Priority 3'] },
                note: { type: 'string', description: "Short note capturing detail the inspector gave beyond the finding's standard wording." },
              },
              required: ['id'],
            },
          },
        },
        required: ['matches'],
      },
    };
  }
  // damper
  return {
    name: 'apply_damper_findings',
    description: 'Report the damper category, overall result, and which deficiencies the transcript described.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['Fire', 'Smoke', 'Combination'] },
        status: { type: 'string', enum: ['pass', 'fail', 'inaccessible'] },
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The deficiency sentence from the candidate list, verbatim.' },
              note: { type: 'string', description: 'Short note capturing detail beyond the deficiency wording.' },
            },
            required: ['id'],
          },
        },
      },
      required: ['matches'],
    },
  };
}

async function interpret(
  transcript: string,
  inspectionType: DictateRequest['inspectionType'],
  candidates: Candidate[],
  apiKey: string
): Promise<{ matches: MatchOut[]; category?: string; status?: string }> {
  const tool = buildTool(inspectionType);
  const candidateList = candidates
    .map((c) => `- id: ${c.id}${c.section ? ` (${c.section})` : ''} — ${c.label}`)
    .join('\n');

  const prompt =
    `An inspector dictated the following while inspecting a ${inspectionType === 'door' ? 'fire/smoke door' : inspectionType} ` +
    `at one location. Match what they said to the applicable checklist items below. ` +
    `Only report items the transcript actually addresses — leave everything else out rather than guessing. ` +
    `If the transcript doesn't clearly support a specific line item but describes a general condition, prefer no match over a weak guess.\n\n` +
    `Transcript:\n"""${transcript}"""\n\n` +
    `Candidate checklist items:\n${candidateList}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Interpretation failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; input?: any }> };
  const toolUse = data.content?.find((b) => b.type === 'tool_use');
  const input = toolUse?.input || {};
  return {
    matches: Array.isArray(input.matches) ? input.matches : [],
    category: input.category,
    status: input.status,
  };
}

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!openaiKey || !anthropicKey) {
    res.status(500).json({ error: 'Dictation is not configured on the server (missing API key).' });
    return;
  }

  const body = req.body as DictateRequest | undefined;
  if (!body?.audioBase64 || !body.mimeType || !body.inspectionType || !Array.isArray(body.candidates)) {
    res.status(400).json({ error: 'Missing audioBase64, mimeType, inspectionType, or candidates' });
    return;
  }
  if (body.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    res.status(413).json({ error: 'Recording is too long. Keep dictations to one location at a time.' });
    return;
  }

  try {
    const transcript = await transcribe(body.audioBase64, body.mimeType, openaiKey);
    if (!transcript.trim()) {
      res.status(200).json({ transcript: '', matches: [] });
      return;
    }
    const { matches, category, status } = await interpret(transcript, body.inspectionType, body.candidates, anthropicKey);
    res.status(200).json({ transcript, matches, category, status });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Dictation failed' });
  }
}
