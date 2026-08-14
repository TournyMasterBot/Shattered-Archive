// apps/game-client/src/features/plugins/core-plugins/voice-dictation.plugin.ts
//
// Voice Dictation — single plugin combining engine/language/model selection
// (formerly voice-dictation-engine) with the two dictation targets: the
// play/command input mic and a floating page-item mic (formerly
// voice-dictation-input). Merged into one configuration flow per user
// request — splitting "which engine" from "where does it dictate" across
// two separately-enabled plugins was more indirection than the feature
// needed. usePlugins.ts carries a one-time storage migration that folds any
// existing voice-dictation-engine/voice-dictation-input installs into this
// plugin's config.
//
// Settings still flow through the shared voiceDictationSettings store
// (rather than being read directly off local config) so anything else that
// ever needs the active engine/language can read it without going through
// the plugin config API.

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import {
  DEFAULT_VOICE_DICTATION_SETTINGS,
  getVoiceDictationSettings,
  setVoiceDictationSettings,
  type VoiceDictationEngineKind,
} from '../shared/voiceDictationSettings';
import {
  checkForEngineUpdate,
  downloadModel,
  isModelInstalled,
  isModelUpdateAvailable,
  transcribeWithAdvancedEngine,
} from '../shared/advancedSttEngine';
import { applyVocabularyCorrection } from '../shared/voiceDictationVocabulary';

const PLAY_AREA_TARGET_ID = 'voice-dictation-mic-slot';
const COMMAND_INPUT_ID = 'game-command-input';
const FLOATING_BUTTON_ID = 'voice-dictation-floating-mic';

const FLOATING_BUTTON_CSS = `
#${FLOATING_BUTTON_ID} {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 500;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #555;
  background: #1a1a1a;
  color: #f0f0f0;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
#${FLOATING_BUTTON_ID}:hover {
  background: #242424;
}
#${FLOATING_BUTTON_ID}.vd-recording {
  border-color: #c94a4a;
  box-shadow: 0 0 0 2px rgba(201, 74, 74, 0.55);
}
`;

const LANGUAGE_OPTIONS = [
  { label: 'English (US)', value: 'en-US' },
  { label: 'English (UK)', value: 'en-GB' },
  { label: 'Spanish (Spain)', value: 'es-ES' },
  { label: 'Spanish (Mexico)', value: 'es-MX' },
  { label: 'French', value: 'fr-FR' },
  { label: 'German', value: 'de-DE' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Other (use custom code below)', value: 'custom' },
];

const ADVANCED_MODEL_OPTIONS = [
  { label: 'wav2vec2 Base (English, faster, smaller download)', value: 'Xenova/wav2vec2-base-960h' },
  { label: 'wav2vec2 Large (English, more accurate, larger download)', value: 'Xenova/wav2vec2-large-960h-lv60-self' },
];

type TargetElement = HTMLInputElement | HTMLTextAreaElement;

function isEditableTarget(el: Element | null): el is TargetElement {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** Sets a React-controlled input/textarea's value and fires a real input event so React notices. */
function setControlledValue(el: TargetElement, next: string): void {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Strips the sentence-formatting speech engines tend to add (trailing
 * periods/commas/question marks, stray capitalization-driven punctuation)
 * that would corrupt exact MUD command syntax — e.g. "look 2.sword" coming
 * back as "look 2. sword". Only applied to the play-area target; page items
 * (notes, chat, etc.) keep natural punctuation.
 */
function sanitizeLiteralCommand(text: string): string {
  return text
    .trim()
    .replace(/[.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

/** Merges newly-dictated text onto whatever is already in the field (trim + single-space join). */
function insertMerged(el: TargetElement, text: string, literal: boolean): void {
  const prev = el.value ?? '';
  const corrected = applyVocabularyCorrection(text ?? '', getVoiceDictationSettings().customVocabulary);
  const next = literal ? sanitizeLiteralCommand(corrected) : corrected;

  let merged: string;
  if (prev.length === 0) merged = next;
  else if (next.length === 0) merged = prev;
  else merged = `${prev.replace(/\s+$/, '')} ${next.replace(/^\s+/, '')}`;

  setControlledValue(el, merged);

  queueMicrotask(() => {
    try {
      el.focus();
    } catch {
      // ignore
    }
  });
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as Window;
  return (w.SpeechRecognition ?? (w as any).webkitSpeechRecognition ?? null) as (new () => SpeechRecognition) | null;
}

/** Records mic audio and resolves a mono Float32Array at 16kHz for the advanced engine. */
class MicRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: BlobPart[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  stop(): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) {
        reject(new Error('Recorder not started'));
        return;
      }

      rec.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        try {
          const blob = new Blob(this.chunks, { type: rec.mimeType });
          const arrayBuffer = await blob.arrayBuffer();
          const audioCtx = new AudioContext();
          const decoded = await audioCtx.decodeAudioData(arrayBuffer);

          // Resample to 16kHz mono via OfflineAudioContext (what Whisper expects).
          const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
          const source = offline.createBufferSource();
          source.buffer = decoded;
          source.connect(offline.destination);
          source.start();
          const rendered = await offline.startRendering();
          await audioCtx.close();
          resolve(rendered.getChannelData(0));
        } catch (err) {
          reject(err);
        }
      };

      rec.stop();
    });
  }
}

export function createVoiceDictationPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'voice-dictation',
      name: 'Voice Dictation',
      version: '0.1.0',
      description:
        "Speech-to-text dictation into the play/command input and/or any other focused page text field. Choose the browser's built-in Web Speech API, or an optional downloadable advanced engine (wav2vec2 — a literal, non-generative acoustic model: no translation, no invented punctuation/wording, runs entirely in-browser and works offline once downloaded), plus language, custom vocabulary correction, and which of the two dictation targets are active.",
    },

    configSchema: {
      defaults: {
        engine: DEFAULT_VOICE_DICTATION_SETTINGS.engine,
        language: DEFAULT_VOICE_DICTATION_SETTINGS.language,
        customLanguage: '',
        advancedModel: DEFAULT_VOICE_DICTATION_SETTINGS.advancedModel,
        customVocabulary: '',
        enablePlayArea: true,
        enablePageItems: false,
        debug: false,
      },
      fields: [
        {
          key: 'engine',
          type: 'select',
          label: 'Recognition engine',
          description: "Browser uses your browser's built-in speech recognition. Advanced downloads a local wav2vec2 model that runs entirely in-browser — a literal, non-generative model (no translation, no invented punctuation/wording), and works offline once downloaded.",
          options: [
            { label: 'Browser (built-in)', value: 'browser' },
            { label: 'Advanced (downloaded)', value: 'advanced' },
          ],
        },
        {
          key: 'language',
          type: 'select',
          label: 'Language',
          description: 'Used by the browser engine. The advanced engine only supports English models currently.',
          options: LANGUAGE_OPTIONS,
        },
        {
          key: 'customLanguage',
          type: 'string',
          label: 'Custom language code (BCP-47)',
          description: 'Only used when Language above is set to "Other". Example: pt-BR, it-IT.',
          placeholder: 'e.g. pt-BR',
          optional: true,
        },
        {
          key: 'advancedModel',
          type: 'select',
          label: 'Advanced engine model',
          description: 'Which wav2vec2 model size to download and use when the engine above is set to Advanced.',
          options: ADVANCED_MODEL_OPTIONS,
        },
        {
          key: 'customVocabulary',
          type: 'textarea',
          label: 'Custom vocabulary',
          description: 'One word per line — MUD-specific names (mobs, spells, items, rooms) that dictation should be corrected toward when it hears something close. Neither engine supports true recognition-time vocabulary biasing, so this is applied as a fuzzy correction pass on the transcribed text. Single-word matching only.',
          placeholder: 'gorgoth\nfirebolt\nsanctum',
          optional: true,
        },
        {
          key: 'enablePlayArea',
          type: 'boolean',
          label: 'Dictate into the play area',
          description: 'Restores the mic button in the command bar. Exclusively the play/command input.',
        },
        {
          key: 'enablePageItems',
          type: 'boolean',
          label: 'Dictate into page items',
          description: 'Adds a floating mic button that dictates into whatever text field is focused. Exclusively everything except the play/command input.',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs engine load/download/update progress and recognition start/stop/errors.',
        },
      ],
      actions: [
        {
          key: 'sync-settings',
          label: 'Apply engine settings',
          description: 'Click after changing engine, language, or model — settings are not applied live otherwise.',
        },
        {
          key: 'download-advanced-model',
          label: 'Download advanced model',
          description: 'Downloads (or reuses an already-downloaded copy of) the selected advanced model.',
        },
        {
          key: 'check-for-engine-update',
          label: 'Check for engine update',
          description: 'Checks whether a newer version of the downloaded advanced model is known, and redownloads it if so.',
        },
        {
          key: 'sync-targets',
          label: 'Apply target settings',
          description: 'Click after toggling the targets above — they are not applied live otherwise.',
        },
      ],
    },

    assets: {
      css: FLOATING_BUTTON_CSS,
    },

    onEnable(api: PluginRuntimeApi) {
      const debugLog = (...args: unknown[]) => {
        if (api.getConfig().debug === true) api.log(...args);
      };

      // ── Engine / language / model settings ──────────────────────────

      const resolveLanguage = (cfg: Record<string, unknown>): string => {
        const lang = String(cfg.language ?? DEFAULT_VOICE_DICTATION_SETTINGS.language);
        if (lang !== 'custom') return lang;
        const custom = String(cfg.customLanguage ?? '').trim();
        return custom || DEFAULT_VOICE_DICTATION_SETTINGS.language;
      };

      const parseVocabulary = (raw: unknown): string[] =>
        String(raw ?? '')
          .split('\n')
          .map((w) => w.trim())
          .filter(Boolean);

      const syncSettings = () => {
        const cfg = api.getConfig();
        const engine = (cfg.engine as VoiceDictationEngineKind) ?? DEFAULT_VOICE_DICTATION_SETTINGS.engine;
        const language = resolveLanguage(cfg);
        const advancedModel = String(cfg.advancedModel ?? DEFAULT_VOICE_DICTATION_SETTINGS.advancedModel);
        const customVocabulary = parseVocabulary(cfg.customVocabulary);

        setVoiceDictationSettings({ engine, language, advancedModel, customVocabulary });

        if (cfg.debug === true) {
          api.log(
            `Settings applied: engine=${engine} language=${language} advancedModel=${advancedModel} vocabulary=${customVocabulary.length} word(s)`,
          );
        }
      };

      syncSettings();
      api.registerAction('sync-settings', syncSettings);

      api.registerAction('download-advanced-model', () => {
        const cfg = api.getConfig();
        const modelId = String(cfg.advancedModel ?? DEFAULT_VOICE_DICTATION_SETTINGS.advancedModel);

        if (isModelInstalled(modelId)) {
          api.log(`${modelId} is already downloaded.`);
          return;
        }

        downloadModel(modelId, api.log).catch((err) => api.error('Failed to download advanced model', err));
      });

      api.registerAction('check-for-engine-update', () => {
        const cfg = api.getConfig();
        const modelId = String(cfg.advancedModel ?? DEFAULT_VOICE_DICTATION_SETTINGS.advancedModel);

        checkForEngineUpdate(modelId, api.log).catch((err) => api.error('Failed to update advanced model', err));
      });

      // Best-effort status log so the user knows whether a prior download exists.
      const initialCfg = api.getConfig();
      if ((initialCfg.engine as VoiceDictationEngineKind) === 'advanced') {
        const modelId = String(initialCfg.advancedModel ?? DEFAULT_VOICE_DICTATION_SETTINGS.advancedModel);
        if (isModelInstalled(modelId)) {
          api.log(`Advanced model ${modelId} previously downloaded — reusing.`);
        } else if (isModelUpdateAvailable(modelId)) {
          api.log(`Advanced model ${modelId} is installed but outdated — run "Check for engine update".`);
        } else {
          api.log(`Advanced model ${modelId} not downloaded yet — run "Download advanced model".`);
        }
      }

      // ── Dictation targets ────────────────────────────────────────────

      let activeStop: (() => void) | null = null;

      const runBrowserRecognition = (target: TargetElement, language: string, literal: boolean, onDone: () => void) => {
        const Ctor = getSpeechRecognitionCtor();
        if (!Ctor) {
          api.error('Voice dictation is not supported in this browser.');
          onDone();
          return;
        }

        const rec = new Ctor();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = language;

        const finalParts: string[] = [];

        rec.onresult = (e: SpeechRecognitionEvent) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const text = (e.results[i][0]?.transcript ?? '').trim();
            if (text) finalParts.push(text);
          }
        };

        rec.onerror = (e: SpeechRecognitionErrorEvent) => {
          api.error(`Dictation error: ${e.error || 'unknown'}`);
        };

        rec.onend = () => {
          const combined = finalParts.join(' ').replace(/\s+/g, ' ').trim();
          if (combined) insertMerged(target, combined, literal);
          onDone();
        };

        activeStop = () => {
          try {
            rec.stop();
          } catch {
            // ignore
          }
        };

        try {
          rec.start();
        } catch (err) {
          api.error('Failed to start dictation', err);
          onDone();
        }
      };

      const runAdvancedRecognition = (target: TargetElement, modelId: string, literal: boolean, onDone: () => void) => {
        const recorder = new MicRecorder();

        recorder
          .start()
          .then(() => {
            activeStop = () => {
              recorder
                .stop()
                .then((audio) => transcribeWithAdvancedEngine(modelId, audio, api.log))
                .then((text) => {
                  if (text) insertMerged(target, text, literal);
                  onDone();
                })
                .catch((err) => {
                  api.error('Advanced dictation failed', err);
                  onDone();
                });
            };
          })
          .catch((err) => {
            api.error('Microphone access failed', err);
            onDone();
          });
      };

      const startRecognition = (target: TargetElement, buttonEl: HTMLElement) => {
        if (activeStop) {
          activeStop();
          return;
        }

        const settings = getVoiceDictationSettings();
        const literal = target.id === COMMAND_INPUT_ID;
        debugLog(`Starting dictation (engine=${settings.engine}, literal=${literal}) into`, target.id || target.tagName);
        buttonEl.classList.add('vd-recording');

        const onDone = () => {
          activeStop = null;
          buttonEl.classList.remove('vd-recording');
        };

        if (settings.engine === 'advanced') {
          runAdvancedRecognition(target, settings.advancedModel, literal, onDone);
        } else {
          runBrowserRecognition(target, settings.language, literal, onDone);
        }
      };

      // Play area target
      const playAreaButton = document.getElementById(PLAY_AREA_TARGET_ID) as HTMLButtonElement | null;
      const onPlayAreaClick = () => {
        const target = document.getElementById(COMMAND_INPUT_ID);
        if (!isEditableTarget(target)) {
          api.error('Command input not found.');
          return;
        }
        startRecognition(target, playAreaButton!);
      };

      // Page items target
      let floatingButton: HTMLButtonElement | null = null;
      const onFloatingClick = () => {
        const active = document.activeElement;
        if (!isEditableTarget(active) || active.id === COMMAND_INPUT_ID) {
          api.error('Focus a text field on the page (other than the command input) before dictating.');
          return;
        }
        startRecognition(active, floatingButton!);
      };

      const syncTargets = () => {
        const cfg = api.getConfig();

        // Play area
        if (cfg.enablePlayArea === true && playAreaButton) {
          // CommandInput.tsx hides this button via the .micSlotHidden CSS
          // Modules class (display: none), not an inline style — an inline
          // style always beats a class selector once set, so setting a real
          // display value (not removeProperty, which is a no-op against a
          // class rule) is what actually reveals the button.
          playAreaButton.style.display = 'inline-block';
          playAreaButton.disabled = false;
          playAreaButton.removeAttribute('aria-hidden');
          playAreaButton.removeEventListener('click', onPlayAreaClick);
          playAreaButton.addEventListener('click', onPlayAreaClick);
        } else if (playAreaButton) {
          playAreaButton.style.display = 'none';
          playAreaButton.disabled = true;
          playAreaButton.setAttribute('aria-hidden', 'true');
          playAreaButton.removeEventListener('click', onPlayAreaClick);
        }

        // Page items
        if (cfg.enablePageItems === true) {
          if (!floatingButton) {
            floatingButton = document.createElement('button');
            floatingButton.type = 'button';
            floatingButton.id = FLOATING_BUTTON_ID;
            floatingButton.textContent = '🎙';
            floatingButton.title = 'Dictate into the focused text field';
            document.body.appendChild(floatingButton);
          }
          floatingButton.removeEventListener('click', onFloatingClick);
          floatingButton.addEventListener('click', onFloatingClick);
        } else if (floatingButton) {
          floatingButton.remove();
          floatingButton = null;
        }
      };

      syncTargets();
      api.registerAction('sync-targets', syncTargets);

      return () => {
        if (activeStop) activeStop();
        if (playAreaButton) {
          playAreaButton.style.display = 'none';
          playAreaButton.disabled = true;
          playAreaButton.setAttribute('aria-hidden', 'true');
          playAreaButton.removeEventListener('click', onPlayAreaClick);
        }
        if (floatingButton) {
          floatingButton.removeEventListener('click', onFloatingClick);
          floatingButton.remove();
          floatingButton = null;
        }
        // Settings remain in shared storage for anything else that reads
        // voiceDictationSettings even after this plugin is disabled.
      };
    },
  };
}
