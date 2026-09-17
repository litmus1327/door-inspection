import { useEffect, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useAudioRecorder, blobToBase64 } from '@/hooks/useAudioRecorder';
import { DictationCandidate, DictationInspectionType, DictationResult, requestDictation } from '@/lib/dictation';
import { enqueueDictation, getReadyDictation, clearReadyDictation } from '@/lib/dictationQueue';

interface DictationRecorderProps {
  pinId?: string;
  inspectionType: DictationInspectionType;
  candidates: DictationCandidate[];
  onResult: (result: DictationResult) => void;
}

/**
 * Record button for "walk up, talk about this location, stop" dictation. One
 * recording covers everything at this pin, not one item at a time. Handles
 * both the online path (transcribe immediately) and the offline path (queue,
 * and let App's reconnect flush hand a result back — picked up here on mount
 * via getReadyDictation).
 */
export default function DictationRecorder({ pinId, inspectionType, candidates, onResult }: DictationRecorderProps) {
  const { isRecording, durationMs, error, start, stop } = useAudioRecorder();
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A dictation recorded offline for this pin, now transcribed and waiting —
  // resume the review as soon as this wizard opens for that pin.
  useEffect(() => {
    if (!pinId) return;
    const ready = getReadyDictation(pinId);
    if (ready) {
      clearReadyDictation(pinId);
      onResult(ready);
    }
    // Only check once, when this wizard screen opens for this pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinId]);

  const handleStop = async () => {
    const clip = await stop();
    if (!clip) return;
    if (navigator.onLine) {
      setProcessing(true);
      setMessage(null);
      try {
        const base64 = await blobToBase64(clip.blob);
        const result = await requestDictation(inspectionType, candidates, base64, clip.mimeType);
        onResult(result);
      } catch (err: any) {
        setMessage(err?.message || 'Dictation failed — try again.');
      } finally {
        setProcessing(false);
      }
    } else if (pinId) {
      await enqueueDictation(pinId, inspectionType, candidates, clip.blob, clip.mimeType);
      setMessage('No signal — queued. It will be ready to review once you\'re back online and reopen this pin.');
    } else {
      setMessage('No signal and no pin to attach this to — recording discarded.');
    }
  };

  return (
    <div className="rounded-sm border border-dashed border-border p-2.5">
      <div className="flex items-center gap-2">
        {!isRecording ? (
          <button
            onClick={start}
            disabled={processing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-primary/40 text-primary text-xs font-mono uppercase tracking-wide hover:bg-primary/10 disabled:opacity-50"
          >
            <Mic size={14} /> {processing ? 'Processing…' : 'Dictate this location'}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-red-500 bg-red-500/10 text-red-500 text-xs font-mono uppercase tracking-wide animate-pulse"
          >
            <Square size={14} /> Stop ({Math.floor(durationMs / 1000)}s)
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Talk through what you see, then stop — findings get proposed for review.
        </span>
      </div>
      {(error || message) && (
        <p className="text-xs text-muted-foreground mt-1.5">{error || message}</p>
      )}
    </div>
  );
}
