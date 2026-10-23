'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
/** Recordings shorter than this are treated as accidental taps. */
const MIN_MS = 400;
/**
 * Sarvam's speech-to-text takes clips under 30 s, so a long recording is cut into pieces of this
 * length. The cut can land mid-word or mid-number: the server joins the pieces' transcripts before
 * mapping (lib/recordings.ts), so they are read as one text.
 */
export const SEGMENT_MS = 28_000;

export type RecorderState = 'idle' | 'recording' | 'unsupported' | 'denied';
/** Why the last recording ended unexpectedly: screen lock / call / app switch, or a tap too short to record. */
export type RecorderNotice = 'interrupted' | 'too_short' | null;

/**
 * Tap-to-toggle recorder. The mic stream is kept open between recordings so
 * the next tap starts instantly (and mobile browsers don't re-prompt).
 * Each piece of a long recording is delivered through `onRecorded` with its own tag.
 */
export function useRecorder(onRecorded: (blob: Blob, meta: { tag: unknown; durationMs: number }) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<RecorderNotice>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const cutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTagRef = useRef<(() => unknown) | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  useEffect(() => {
    if (typeof window !== 'undefined' && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')) {
      setState('unsupported');
    }
    return () => {
      if (cutTimer.current) clearTimeout(cutTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [state]);

  /** Records one piece; after SEGMENT_MS it hands off to the next piece. */
  const beginSegment = useCallback((tag: unknown) => {
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(streamRef.current!, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const segStart = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      const durationMs = Date.now() - segStart;
      if (durationMs >= MIN_MS && blob.size > 0) onRecordedRef.current(blob, { tag, durationMs });
      // Only the first piece can be an accidental tap; later pieces just caught the stop.
      else if (segStart - startedAt.current < 1000) setNotice('too_short');
    };
    recRef.current = rec;
    rec.start();
    cutTimer.current = setTimeout(() => {
      if (recRef.current !== rec) return;
      const next = nextTagRef.current ? nextTagRef.current() : tag;
      // Start the next piece first, then stop this one: a few ms of overlap instead of a gap.
      beginSegment(next);
      rec.stop();
    }, SEGMENT_MS);
  }, []);

  /** `nextTag` is called for each extra piece of a long recording (e.g. to take a new seq). */
  const start = useCallback(
    async (tag: unknown, opts: { nextTag?: () => unknown } = {}) => {
      try {
        if (!streamRef.current || streamRef.current.getTracks().every((t) => t.readyState === 'ended')) {
          streamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          // A phone call (or another app) taking the mic ends the track: stop and send what we have.
          for (const t of streamRef.current.getAudioTracks()) t.addEventListener('ended', () => stopRef.current('interrupted'));
        }
      } catch {
        setState('denied');
        return false;
      }
      setNotice(null);
      nextTagRef.current = opts.nextTag ?? null;
      startedAt.current = Date.now(); // the timer shows the whole recording, across pieces
      setElapsed(0);
      beginSegment(tag);
      setState('recording');
      return true;
    },
    [beginSegment],
  );

  /** Stops and sends what was recorded. `interrupted` = not the user's tap (lock screen, call, app switch). */
  const stop = useCallback((reason?: 'interrupted') => {
    if (cutTimer.current) clearTimeout(cutTimer.current);
    const wasRecording = recRef.current?.state === 'recording';
    if (wasRecording) recRef.current!.stop();
    recRef.current = null;
    setState((s) => (s === 'recording' ? 'idle' : s));
    if (reason && wasRecording) setNotice('interrupted');
  }, []);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Screen locked or app switched mid-recording: mobile browsers stop delivering audio, so send it now.
  useEffect(() => {
    const onHide = () => document.hidden && stopRef.current('interrupted');
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return { state, elapsed, start, stop, notice, clearNotice: () => setNotice(null) };
}
