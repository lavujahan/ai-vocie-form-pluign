'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
/** Recordings shorter than this are treated as accidental taps. */
const MIN_MS = 400;

export type RecorderState = 'idle' | 'recording' | 'unsupported' | 'denied';

/**
 * Tap-to-toggle recorder. The mic stream is kept open between recordings so
 * the next tap starts instantly (and mobile browsers don't re-prompt).
 */
export function useRecorder(onRecorded: (blob: Blob, meta: { tag: unknown }) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const tagRef = useRef<unknown>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  useEffect(() => {
    if (typeof window !== 'undefined' && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')) {
      setState('unsupported');
    }
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [state]);

  const start = useCallback(async (tag: unknown) => {
    try {
      if (!streamRef.current || streamRef.current.getTracks().every((t) => t.readyState === 'ended')) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
    } catch {
      setState('denied');
      return false;
    }
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    tagRef.current = tag;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const duration = Date.now() - startedAt.current;
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      if (duration >= MIN_MS && blob.size > 0) onRecordedRef.current(blob, { tag: tagRef.current });
    };
    recRef.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    rec.start();
    setState('recording');
    return true;
  }, []);

  const stop = useCallback(() => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    recRef.current = null;
    setState('idle');
  }, []);

  return { state, elapsed, start, stop };
}
