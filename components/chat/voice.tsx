"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/e2ee";
import { Pause, Play } from "../icons";

export const VOICE_MAX_SECONDS = 180;
const BARS = 40;

export type Recording = { blob: Blob; bytes: Uint8Array; mime: string; dur: number; wave: number[] };

/** The best format this browser can record: Opus in WebM (Chrome, Firefox, Android) or AAC in MP4 (Safari). */
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/** Squeeze a loudness trace into `n` bars between 0.06 and 1. */
export function toBars(levels: number[], n = BARS) {
  if (!levels.length) return Array(n).fill(0.06);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * levels.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
    out.push(Math.max(...levels.slice(a, b)));
  }
  const top = Math.max(...out, 0.02);
  return out.map((v) => Math.round(Math.max(0.06, v / top) * 100) / 100);
}

/** Records one voice note from the microphone, with a live loudness trace for the waveform. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const parts = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; chunks: Blob[]; trace: number[]; started: number; timer: ReturnType<typeof setInterval> } | null>(null);

  const teardown = useCallback(() => {
    const p = parts.current;
    if (!p) return;
    clearInterval(p.timer);
    p.stream.getTracks().forEach((t) => t.stop());
    p.ctx.close().catch(() => {});
    parts.current = null;
    setRecording(false);
  }, []);
  useEffect(() => teardown, [teardown]);

  const start = useCallback(async () => {
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't record audio");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const trace: number[] = [];
    const started = Date.now();
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      trace.push(Math.sqrt(sum / buf.length));
      setLevels(trace.slice(-BARS));
      setElapsed((Date.now() - started) / 1000);
    }, 60);
    parts.current = { rec, stream, ctx, chunks, trace, started, timer };
    rec.start(250);
    setLevels([]);
    setElapsed(0);
    setRecording(true);
  }, []);

  const stop = useCallback(async (): Promise<Recording | null> => {
    const p = parts.current;
    if (!p) return null;
    const done = new Promise<void>((res) => (p.rec.onstop = () => res()));
    p.rec.stop();
    await done;
    const dur = (Date.now() - p.started) / 1000;
    const mime = (p.rec.mimeType || "audio/webm").split(";")[0];
    const blob = new Blob(p.chunks, { type: mime });
    const wave = toBars(p.trace);
    teardown();
    if (dur < 0.6 || !blob.size) return null;
    return { blob, bytes: new Uint8Array(await blob.arrayBuffer()), mime, dur: Math.min(dur, VOICE_MAX_SECONDS), wave };
  }, [teardown]);

  return { recording, elapsed, levels, start, stop, cancel: teardown };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// One voice note plays at a time, like any messaging app.
let playing: HTMLAudioElement | null = null;

/** A voice note bubble: play/pause, a waveform that fills as it plays (tap to seek), time and speed. */
export function VoiceNote({ a, url, mine, children }: { a: Attachment; url: string | null; mine: boolean; children?: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const dur = a.dur ?? 0;
  const wave = a.wave?.length ? a.wave : Array(BARS).fill(0.2);

  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => {
      if (audio.current) setT(audio.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  async function toggle() {
    const el = audio.current;
    if (!el || !url) return;
    if (on) return el.pause();
    if (playing && playing !== el) playing.pause();
    playing = el;
    el.playbackRate = rate;
    await el.play().catch(() => setOn(false));
  }
  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = audio.current;
    if (!el || !url || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    setT(el.currentTime);
  }
  function cycleRate() {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  }
  const frac = dur ? Math.min(1, t / dur) : 0;
  const lit = mine ? "bg-white" : "bg-brand";
  const dim = mine ? "bg-white/35" : "bg-white/25";
  return (
    <div className="flex w-[236px] items-center gap-2.5 py-1 sm:w-[268px]">
      {url && <audio ref={audio} src={url} preload="metadata" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => { setOn(false); setT(0); }} />}
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${mine ? "bg-white text-mine" : "bg-brand text-black"}`}
        aria-label={on ? "Pause voice note" : "Play voice note"}
      >
        {on ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 cursor-pointer items-center gap-[2px]" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}>
          {wave.map((v, i) => (
            <span key={i} className={`w-[3px] shrink-0 rounded-full ${i / wave.length < frac ? lit : dim}`} style={{ height: `${Math.max(12, v * 100)}%` }} />
          ))}
        </div>
        <div className={`mt-0.5 flex items-center justify-between text-[11px] tabular ${mine ? "text-white/70" : "text-mute"}`}>
          <span>{mmss(on || t ? t : dur)}</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={cycleRate} className={`rounded-full px-1.5 font-semibold ${mine ? "bg-white/15" : "bg-white/10"}`} aria-label="Playback speed">{rate}×</button>
            {children}
          </span>
        </div>
      </div>
    </div>
  );
}
