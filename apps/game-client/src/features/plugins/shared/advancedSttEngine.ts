// apps/game-client/src/features/plugins/shared/advancedSttEngine.ts
//
// Wraps the optional "advanced" speech-to-text engine (@huggingface/transformers
// running a wav2vec2 CTC model via WASM) behind a dynamic import, so the
// dependency never enters the default bundle for users who leave
// engine: 'browser' (the default in voiceDictationSettings.ts). Only touched
// by voice-dictation.plugin.ts's download/update actions and its
// recognition call when the selected engine is 'advanced'.
//
// Deliberately wav2vec2 (CTC), not Whisper (seq2seq/generative): CTC models
// do direct, frame-synchronous acoustic-to-character decoding with no
// autoregressive decoder — there's no 'translate' task, no learned sentence
// punctuation/capitalization, and no risk of the model rewording or
// hallucinating text the way a generative decoder can. That's what "literal"
// transcription means for MUD commands, which this codebase's format is
// specific about — see sanitizeLiteralCommand in voice-dictation.plugin.ts
// for the remaining (non-model) formatting cleanup.
//
// @huggingface/transformers caches the raw model weights itself (Cache
// API/IndexedDB, keyed by model id + revision). This module additionally
// keeps its own small manifest recording *which* model/revision that cache
// currently holds, since the library's cache alone can't answer "is this
// stale" or "what did we last download" — see MODEL_VERSIONS below.

const MANIFEST_KEY = 'shatteredArchive.plugins.speechToText.advancedEngine';

/** Bump the version string here when a model's known-good revision changes. */
const MODEL_VERSIONS: Record<string, string> = {
  'Xenova/wav2vec2-base-960h': '1',
  'Xenova/wav2vec2-large-960h-lv60-self': '1',
};

export interface AdvancedEngineManifest {
  modelId: string;
  modelVersion: string;
  downloadedAt: number;
}

function readManifest(): AdvancedEngineManifest | null {
  try {
    const raw = window.localStorage.getItem(MANIFEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.modelId !== 'string') return null;
    return parsed as AdvancedEngineManifest;
  } catch {
    return null;
  }
}

function writeManifest(manifest: AdvancedEngineManifest | null): void {
  try {
    if (manifest === null) {
      window.localStorage.removeItem(MANIFEST_KEY);
    } else {
      window.localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
    }
  } catch {
    // ignore
  }
}

/** True if the manifest says this exact model+version is already downloaded. */
export function isModelInstalled(modelId: string): boolean {
  const manifest = readManifest();
  if (!manifest || manifest.modelId !== modelId) return false;
  return manifest.modelVersion === (MODEL_VERSIONS[modelId] ?? '1');
}

/** True if a *different* version of this model is installed than the latest known. */
export function isModelUpdateAvailable(modelId: string): boolean {
  const manifest = readManifest();
  if (!manifest || manifest.modelId !== modelId) return false;
  return manifest.modelVersion !== (MODEL_VERSIONS[modelId] ?? '1');
}

type Pipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>;

let pipelinePromise: Promise<Pipeline> | null = null;
let pipelineModelId: string | null = null;

async function loadPipeline(modelId: string, log: (...args: unknown[]) => void): Promise<Pipeline> {
  if (pipelinePromise && pipelineModelId === modelId) return pipelinePromise;

  pipelineModelId = modelId;
  pipelinePromise = (async () => {
    log(`Loading advanced speech engine (${modelId})…`);
    const { pipeline } = await import('@huggingface/transformers');
    const asrPipeline = await pipeline('automatic-speech-recognition', modelId);
    log('Advanced speech engine ready.');
    return asrPipeline as unknown as Pipeline;
  })();

  return pipelinePromise;
}

/**
 * Downloads (or reuses an already-cached) model, updating the manifest on
 * success. Safe to call even if already installed — the underlying library
 * short-circuits from its own cache.
 */
export async function downloadModel(modelId: string, log: (...args: unknown[]) => void): Promise<void> {
  await loadPipeline(modelId, log);
  writeManifest({
    modelId,
    modelVersion: MODEL_VERSIONS[modelId] ?? '1',
    downloadedAt: Date.now(),
  });
}

/**
 * Clears the manifest for the given model (forcing a real redownload on next
 * loadPipeline call) if a newer version is known, then downloads it.
 */
export async function checkForEngineUpdate(modelId: string, log: (...args: unknown[]) => void): Promise<boolean> {
  if (!isModelInstalled(modelId) && !isModelUpdateAvailable(modelId)) {
    log(`Advanced speech engine (${modelId}) is not downloaded yet — run "Download advanced model" first.`);
    return false;
  }

  if (!isModelUpdateAvailable(modelId)) {
    log(`Advanced speech engine (${modelId}) is already up to date.`);
    return false;
  }

  log(`Updating advanced speech engine (${modelId})…`);
  pipelinePromise = null;
  pipelineModelId = null;
  await downloadModel(modelId, log);
  log(`Advanced speech engine (${modelId}) updated.`);
  return true;
}

/**
 * True if the string looks like the all-caps, unpunctuated output typical of
 * Librispeech-trained wav2vec2 checkpoints (their training transcripts are
 * uppercase) — as opposed to a string that already has real mixed case.
 */
function looksAllCaps(text: string): boolean {
  return text.length > 0 && text === text.toUpperCase() && text !== text.toLowerCase();
}

/**
 * Runs recognition on captured audio (mono Float32Array, 16kHz). Loads/caches
 * the pipeline on first use if not already resident from a prior download.
 * CTC models take no generation options (no language/task kwargs — those are
 * a Whisper-specific concept this engine deliberately avoids, see the header
 * comment above).
 */
export async function transcribeWithAdvancedEngine(
  modelId: string,
  audio: Float32Array,
  log: (...args: unknown[]) => void,
): Promise<string> {
  const asrPipeline = await loadPipeline(modelId, log);
  const result = await asrPipeline(audio);
  const text = (result?.text ?? '').trim();
  return looksAllCaps(text) ? text.toLowerCase() : text;
}
