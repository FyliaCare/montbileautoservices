/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Voice Engine — Browser Speech API wrapper for Hey Monty voice bot.
 * Handles SpeechRecognition (STT) and SpeechSynthesis (TTS).
 * 100% client-side, no API keys, works in Chrome/Edge/Safari.
 */

// ─── Browser compatibility ───
function getSR(): (new () => any) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function isVoiceSupported(): boolean {
  return !!getSR() && typeof window !== "undefined" && "speechSynthesis" in window;
}

// ─── Speech Recognition (STT) ───
export interface RecognitionCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export function startRecognition(cb: RecognitionCallbacks): { stop: () => void } | null {
  const SR = getSR();
  if (!SR) { cb.onError("unsupported"); return null; }

  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        final += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }
    if (final) cb.onFinal(final.trim());
    else if (interim) cb.onInterim(interim.trim());
  };

  recognition.onerror = (event: any) => {
    const err = event.error;
    if (err === "no-speech") cb.onError("no-speech");
    else if (err === "not-allowed" || err === "service-not-allowed") cb.onError("not-allowed");
    else if (err === "aborted") cb.onError("aborted");
    else cb.onError(err || "unknown");
  };

  recognition.onend = () => cb.onEnd();

  try {
    recognition.start();
  } catch {
    cb.onError("start-failed");
    return null;
  }

  return {
    stop: () => { try { recognition.stop(); } catch { /* noop */ } },
  };
}

// ─── Speech Synthesis (TTS) ───
let voicesReady = false;

export function preloadVoices(): void {
  if (typeof window === "undefined" || voicesReady) return;
  voicesReady = true;
  window.speechSynthesis?.getVoices();
  if (window.speechSynthesis?.addEventListener) {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      window.speechSynthesis.getVoices();
    });
  }
}

export function speak(text: string, onEnd?: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  // Split long text into chunks at sentence boundaries to prevent TTS cutoff
  const chunks = splitIntoChunks(text, 200);

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang.startsWith("en") && /google|samantha|microsoft|zira|david/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("en") && !v.localService) ||
    voices.find((v) => v.lang.startsWith("en"));

  let current = 0;
  const speakNext = () => {
    if (current >= chunks.length) {
      onEnd?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(chunks[current]);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = "en-US";
    if (preferred) utterance.voice = preferred;

    utterance.onend = () => { current++; speakNext(); };
    utterance.onerror = () => { current++; speakNext(); };
    window.speechSynthesis.speak(utterance);
  };
  speakNext();
}

/** Split text into chunks at sentence/clause boundaries */
function splitIntoChunks(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let split = rest.lastIndexOf(". ", maxLen);
    if (split < maxLen * 0.3) split = rest.lastIndexOf("! ", maxLen);
    if (split < maxLen * 0.3) split = rest.lastIndexOf("? ", maxLen);
    if (split < maxLen * 0.3) split = rest.lastIndexOf(", ", maxLen);
    if (split < maxLen * 0.3) split = rest.lastIndexOf(" ", maxLen);
    if (split <= 0) split = maxLen;
    else split += 1; // include the punctuation
    chunks.push(rest.slice(0, split).trim());
    rest = rest.slice(split).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined") {
    window.speechSynthesis?.cancel();
  }
}
