'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AUTO_STOP_SECONDS } from '../src/voice-tips';
import { silenceGate } from './silence';

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
/**
 * Why the last recording ended by itself: screen lock / call / app switch, a tap too short to record,
 * or silence after speech (auto-stop).
 */
export type RecorderNotice = 'interrupted' | 'silence' | 'too_short' | null;
type StopReason = 'interrupted' | 'silence';

/** How often the mic level is checked for auto-stop. */
const LEVEL_EVERY_MS = 100;
/** The "stops in N s" countdown shows after this much silence. */
const SHOW_QUIET_MS = 1500;

/** Mic level (RMS, 0–1) for auto-stop; null where Web Audio isn't available (recording works without it). */
function levelMeter(stream: MediaStream): { level: () => number; close: () => void } | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    return {
      level: () => {
        if (ctx.state === 'suspended') void ctx.resume();
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        return Math.sqrt(sum / buf.length);
      },
      close: () => void ctx.close().catch(() => null),
    };
  } catch {
    return null;
  }
}

/**
 * Tap-to-toggle recorder. The mic stream is kept open between recordings so
 * the next tap starts instantly (and mobile browsers don't re-prompt).
 * Each piece of a long recording is delivered through `onRecorded` with its own tag; `last` marks the
 * piece that ended the recording (Stop, screen lock, call, app switch), not a 28 s cut.
 * `releaseMic` closes the mic after each recording instead (a page that stays open on a computer
 * shouldn't look like it is listening).
 */
export function useRecorder(
  onRecorded: (blob: Blob, meta: { tag: unknown; durationMs: number; last: boolean }) => void,
  { releaseMic = false }: { releaseMic?: boolean } = {},
) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<RecorderNotice>(null);
  /** Seconds until auto-stop, shown in the last seconds of silence after speech (0: not counting down). */
  const [stopsIn, setStopsIn] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<ReturnType<typeof levelMeter>>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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
      if (levelTimer.current) clearInterval(levelTimer.current);
      meterRef.current?.close();
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
    let cut = false;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const durationMs = Date.now() - segStart;
      const later = segStart - startedAt.current >= 1000;
      if (durationMs >= MIN_MS && blob.size > 0) onRecordedRef.current(blob, { tag, durationMs, last: !cut });
      // A later piece just caught the stop: still sent, as it tells the server the recording ended (the
      // server maps the pieces before it without transcribing this sliver).
      else if (later && !cut) onRecordedRef.current(blob.size > 0 ? blob : new Blob([new Uint8Array(1)], { type }), { tag, durationMs, last: true });
      // Only the first piece can be an accidental tap.
      else if (!later) setNotice('too_short');
    };
    recRef.current = rec;
    rec.start();
    cutTimer.current = setTimeout(() => {
      if (recRef.current !== rec) return;
      const next = nextTagRef.current ? nextTagRef.current() : tag;
      // Start the next piece first, then stop this one: a few ms of overlap instead of a gap.
      beginSegment(next);
      cut = true;
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
          meterRef.current?.close();
          meterRef.current = levelMeter(streamRef.current);
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
      // Auto-stop: silence after speech ends the recording, as if Stop was tapped (across the 28 s pieces).
      const meter = meterRef.current;
      if (meter) {
        const gate = silenceGate({ silenceMs: AUTO_STOP_SECONDS * 1000 });
        if (levelTimer.current) clearInterval(levelTimer.current);
        levelTimer.current = setInterval(() => {
          const now = Date.now();
          if (gate.push(meter.level(), now)) return stopRef.current('silence');
          const quiet = gate.quietMs(now);
          setStopsIn(quiet >= SHOW_QUIET_MS ? Math.ceil((AUTO_STOP_SECONDS * 1000 - quiet) / 1000) : 0);
        }, LEVEL_EVERY_MS);
      }
      return true;
    },
    [beginSegment],
  );

  /**
   * Stops and sends what was recorded. A reason = not the user's tap: `interrupted` (lock screen, call,
   * app switch) or `silence` (auto-stop after speech).
   */
  const stop = useCallback((reason?: StopReason) => {
    if (cutTimer.current) clearTimeout(cutTimer.current);
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
    setStopsIn(0);
    const wasRecording = recRef.current?.state === 'recording';
    if (wasRecording) recRef.current!.stop();
    recRef.current = null;
    if (releaseMic) {
      meterRef.current?.close();
      meterRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState((s) => (s === 'recording' ? 'idle' : s));
    if (reason && wasRecording) setNotice(reason);
  }, [releaseMic]);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Screen locked or app switched mid-recording: mobile browsers stop delivering audio, so send it now.
  useEffect(() => {
    const onHide = () => document.hidden && stopRef.current('interrupted');
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return { state, elapsed, stopsIn, start, stop, notice, clearNotice: () => setNotice(null) };
}
