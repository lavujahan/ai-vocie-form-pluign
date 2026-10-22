'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_SEGMENT_MS, rms, SplitDetector } from './split';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
/** Recordings shorter than this are treated as accidental taps. */
const MIN_MS = 400;
/** How often the mic loudness is checked for a pause. */
const METER_MS = 50;

export type RecorderState = 'idle' | 'recording' | 'unsupported' | 'denied';

/**
 * Tap-to-toggle recorder. The mic stream is kept open between recordings so
 * the next tap starts instantly (and mobile browsers don't re-prompt).
 *
 * Sarvam's speech-to-text takes clips under 30 s, so a long recording is cut into pieces:
 * at the first pause after ~20 s, or at 28 s at the latest (see split.ts). The next piece starts
 * before the previous one stops, so nothing spoken at the cut is lost. Each piece is delivered
 * through `onRecorded` with its own tag.
 */
export function useRecorder(onRecorded: (blob: Blob, meta: { tag: unknown }) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const hardCutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meterTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextTagRef = useRef<(() => unknown) | null>(null);
  const audio = useRef<{ ctx: AudioContext; analyser: AnalyserNode; stream: MediaStream } | null>(null);
  const detector = useRef(new SplitDetector());
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const clearTimers = () => {
    if (hardCutTimer.current) clearTimeout(hardCutTimer.current);
    if (meterTimer.current) clearInterval(meterTimer.current);
    hardCutTimer.current = meterTimer.current = null;
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')) {
      setState('unsupported');
    }
    return () => {
      clearTimers();
      audio.current?.ctx.close().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [state]);

  /** Loudness meter on the mic stream, for pause detection. Optional: without it we cut at 28 s. */
  const ensureMeter = useCallback(async (stream: MediaStream) => {
    if (audio.current?.stream === stream) {
      if (audio.current.ctx.state === 'suspended') await audio.current.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      if (ctx.state === 'suspended') await ctx.resume();
      audio.current?.ctx.close().catch(() => {});
      audio.current = { ctx, analyser, stream };
    } catch {
      audio.current = null;
    }
  }, []);

  /** Records one piece and arranges the cut to the next one. */
  const beginSegment = useCallback((tag: unknown) => {
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(streamRef.current!, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const segStart = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      if (Date.now() - segStart >= MIN_MS && blob.size > 0) onRecordedRef.current(blob, { tag });
    };
    recRef.current = rec;
    rec.start();

    const cut = () => {
      if (recRef.current !== rec) return;
      clearTimers();
      const next = nextTagRef.current ? nextTagRef.current() : tag;
      // Start the next piece first, then stop this one: a few ms of overlap instead of a gap.
      beginSegment(next);
      rec.stop();
    };

    detector.current.startSegment();
    const meter = audio.current;
    if (meter) {
      const buf = new Float32Array(meter.analyser.fftSize);
      let last = Date.now();
      meterTimer.current = setInterval(() => {
        const now = Date.now();
        meter.analyser.getFloatTimeDomainData(buf);
        if (detector.current.update(rms(buf), now - last)) cut();
        last = now;
      }, METER_MS);
    }
    // Safety net: the meter's interval can be throttled (e.g. screen off); never exceed the limit.
    hardCutTimer.current = setTimeout(cut, MAX_SEGMENT_MS);
  }, []);

  /** `nextTag` is called for each extra piece of a long recording (e.g. to take a new seq). */
  const start = useCallback(
    async (tag: unknown, opts: { nextTag?: () => unknown } = {}) => {
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
      await ensureMeter(streamRef.current);
      detector.current = new SplitDetector(); // learn this recording's background noise afresh
      nextTagRef.current = opts.nextTag ?? null;
      startedAt.current = Date.now(); // the timer shows the whole recording, across pieces
      setElapsed(0);
      beginSegment(tag);
      setState('recording');
      return true;
    },
    [beginSegment, ensureMeter],
  );

  const stop = useCallback(() => {
    clearTimers();
    if (recRef.current?.state === 'recording') recRef.current.stop();
    recRef.current = null;
    setState('idle');
  }, []);

  return { state, elapsed, start, stop };
}
