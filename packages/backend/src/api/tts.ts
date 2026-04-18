// ---------------------------------------------------------------------------
// Text-to-speech via OpenAI gpt-4o-mini-tts
// ---------------------------------------------------------------------------
//
// Used by the chat streaming endpoint to turn assistant sentences into MP3
// audio that the browser plays back in order. Also exposes /api/tts/preview
// so the settings page can sample voice+tone before enabling it.

import type { FastifyInstance } from 'fastify';
import OpenAI, { toFile } from 'openai';
import { apiKeyFor, loadLlmRuntimeSettings, DEFAULT_TTS_INSTRUCTIONS, TTS_VOICES, type TtsVoice } from './llm-config.js';
import { authenticate } from './auth.js';

const TTS_MODEL = 'gpt-4o-mini-tts';

export interface SynthesizeOpts {
  apiKey: string;
  voice: TtsVoice;
  instructions: string;
}

export async function synthesizeSentence(text: string, opts: SynthesizeOpts): Promise<Buffer> {
  const openai = new OpenAI({ apiKey: opts.apiKey });
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: opts.voice,
    input: text,
    instructions: opts.instructions,
    response_format: 'mp3',
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Splits a streaming buffer on sentence boundaries. Returns `{ sentences, rest }`
 * — `rest` is the tail that hasn't ended in `.!?` yet. Also flushes chunks
 * longer than `maxLen` to avoid one long unpunctuated blob delaying playback.
 */
export function extractSentences(buffer: string, maxLen = 200): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;

  const sentenceRe = /([.!?]+["')\]]?)(\s+|$)/;
  while (true) {
    const m = sentenceRe.exec(rest);
    if (!m) break;
    const end = m.index + m[1].length;
    const sentence = rest.slice(0, end).trim();
    if (sentence) sentences.push(sentence);
    rest = rest.slice(end + m[2].length);
  }

  // Force-flush if the remainder is too long — prevents endless buffering.
  while (rest.length > maxLen) {
    const cut = rest.lastIndexOf(' ', maxLen);
    const at = cut > 40 ? cut : maxLen;
    const chunk = rest.slice(0, at).trim();
    if (chunk) sentences.push(chunk);
    rest = rest.slice(at).trimStart();
  }

  return { sentences, rest };
}

/**
 * Strip markdown so the TTS reads text naturally.
 * Mirrors the old frontend stripMarkdown — kept server-side now that audio
 * is synthesized on the backend.
 */
export function stripMarkdownForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function registerTtsRoutes(app: FastifyInstance) {
  app.post<{ Body: { text?: string; voice?: string; instructions?: string } }>(
    '/api/tts/preview',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const settings = await loadLlmRuntimeSettings();
      const active = apiKeyFor('tts', settings);
      if (!active) {
        return reply.code(400).send({
          error: 'Voice requires an OpenAI API key. Add one in Settings → LLM Integration.',
        });
      }

      const text = (req.body.text ?? 'Hi! This is how I will sound while helping around the house.').slice(0, 500);
      const rawVoice = req.body.voice ?? settings.ttsVoice;
      const voice: TtsVoice = (TTS_VOICES as readonly string[]).includes(rawVoice)
        ? (rawVoice as TtsVoice)
        : settings.ttsVoice;
      const instructions = (req.body.instructions ?? settings.ttsInstructions ?? DEFAULT_TTS_INSTRUCTIONS).slice(0, 2000);

      try {
        const mp3 = await synthesizeSentence(stripMarkdownForTts(text), {
          apiKey: active.key,
          voice,
          instructions,
        });
        reply.header('Content-Type', 'audio/mpeg');
        reply.header('Cache-Control', 'no-store');
        return reply.send(mp3);
      } catch (err) {
        req.log.error({ err }, 'TTS preview failed');
        return reply.code(502).send({ error: 'TTS synthesis failed' });
      }
    },
  );

  // Speech-to-text fallback for browsers without Web Speech API (Safari).
  // Accepts audio/* upload; returns JSON { text }.
  app.post(
    '/api/stt',
    { preHandler: [authenticate] },
    async (req, reply) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({ error: 'Audio body required' });
      }
      if (body.length > 25 * 1024 * 1024) {
        return reply.code(413).send({ error: 'Audio too large (max 25MB)' });
      }

      const settings = await loadLlmRuntimeSettings();
      const active = apiKeyFor('tts', settings);
      if (!active) {
        return reply.code(400).send({
          error: 'Voice input requires an OpenAI API key. Add one in Settings → LLM Integration.',
        });
      }

      const contentType = String(req.headers['content-type'] ?? 'audio/webm').split(';')[0].trim();
      const ext = contentType.split('/')[1] || 'webm';
      const filename = `speech.${ext === 'mpeg' ? 'mp3' : ext}`;

      try {
        const openai = new OpenAI({ apiKey: active.key });
        const file = await toFile(body, filename, { type: contentType });
        const transcription = await openai.audio.transcriptions.create({
          file,
          model: 'whisper-1',
        });
        return reply.send({ text: transcription.text ?? '' });
      } catch (err) {
        req.log.error({ err }, 'STT transcription failed');
        return reply.code(502).send({ error: 'Speech transcription failed' });
      }
    },
  );
}
