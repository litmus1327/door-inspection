import { useCallback, useRef, useState } from 'react';

// A stuck recording (phone slips in a pocket, inspector forgets to stop)
// shouldn't run forever — auto-stop well past what a per-location dictation
// should ever need.
export const MAX_RECORDING_MS = 3 * 60 * 1000;

export interface AudioRecorderState {
  isRecording: boolean;
  durationMs: number;
  error: string | null;
}

export interface AudioRecorderResult {
  blob: Blob;
  mimeType: string;
}

/**
 * Records a short voice memo via MediaRecorder/getUserMedia. WebM/Opus keeps
 * clips small (well under any server request-size limit for the "walk up,
 * talk about this location, stop" workflow this is built for).
 */
export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    durationMs: 0,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const resolveRef = useRef<((r: AudioRecorderResult | null) => void) | null>(null);

  const pickMimeType = (): string => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return '';
  };

  const clearTimers = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (autoStopRef.current) { window.clearTimeout(autoStopRef.current); autoStopRef.current = null; }
  };

  const start = useCallback(async () => {
    setState({ isRecording: false, durationMs: 0, error: null });
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ isRecording: false, durationMs: 0, error: 'This device/browser cannot record audio.' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        clearTimers();
        resolveRef.current?.(chunksRef.current.length ? { blob, mimeType: recorder.mimeType || mimeType || 'audio/webm' } : null);
        resolveRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setState({ isRecording: true, durationMs: 0, error: null });
      tickRef.current = window.setInterval(() => {
        setState((s) => ({ ...s, durationMs: Date.now() - startedAtRef.current }));
      }, 250);
      autoStopRef.current = window.setTimeout(() => {
        mediaRecorderRef.current?.stop();
      }, MAX_RECORDING_MS);
    } catch {
      setState({ isRecording: false, durationMs: 0, error: 'Microphone permission was denied or unavailable.' });
    }
  }, []);

  /** Resolves with the recorded clip, or null if nothing was captured. */
  const stop = useCallback((): Promise<AudioRecorderResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') { resolve(null); return; }
      resolveRef.current = resolve;
      setState((s) => ({ ...s, isRecording: false }));
      recorder.stop();
    });
  }, []);

  /** Discards whatever's been captured without returning it. */
  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    resolveRef.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; clearTimers(); }
    setState({ isRecording: false, durationMs: 0, error: null });
  }, []);

  return { ...state, start, stop, cancel };
}

/** Converts a recorded blob to base64 for the JSON request body. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}
