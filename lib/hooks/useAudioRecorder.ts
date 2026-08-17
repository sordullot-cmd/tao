"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function mapGetUserMediaError(err: any): string {
  const name = err?.name || "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Micro refusé par le navigateur";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Aucun micro détecté";
    case "NotReadableError":
    case "TrackStartError":
      return "Micro déjà utilisé par une autre application";
    case "SecurityError":
      return "Origine non sécurisée — HTTPS requis";
    default:
      return err?.message || "Impossible d'accéder au micro";
  }
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function useAudioRecorder(): {
  recording: boolean;
  durationSec: number;
  /** Niveau d'entrée du micro (RMS 0–1), rafraîchi 10 fois par seconde. */
  level: number;
  error: string | null;
  supported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  reset: () => void;
} {
  const [recording, setRecording] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimestampRef = useRef<number>(0);
  const mimeTypeRef = useRef<string>("");
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  /* Chaîne d'écoute du niveau, indépendante du MediaRecorder : elle sert au
     VU-mètre affiché pendant la prise (saturation, souffle, bruit de fond). */
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sampleBufRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof window !== "undefined" &&
      typeof window.MediaRecorder !== "undefined";
    setSupported(ok);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Démonte la chaîne d'analyse et remet le niveau à zéro.
  const closeMeter = useCallback(() => {
    analyserRef.current = null;
    sampleBufRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      try {
        void ctx.close();
      } catch {
        /* fermeture best effort */
      }
    }
    setLevel(0);
  }, []);

  // Niveau instantané (RMS) de la dernière fenêtre lue par l'analyseur.
  const readLevel = useCallback((): number => {
    const analyser = analyserRef.current;
    const buf = sampleBufRef.current;
    if (!analyser || !buf) return 0;
    try {
      analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    } catch {
      return 0;
    }
    let acc = 0;
    for (let i = 0; i < buf.length; i++) acc += buf[i] * buf[i];
    const rms = Math.sqrt(acc / buf.length);
    return Number.isFinite(rms) ? Math.min(1, rms) : 0;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Branchement du VU-mètre : best effort, une absence d'AudioContext ne
      // doit jamais empêcher d'enregistrer.
      try {
        const Ctor =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          ctx.createMediaStreamSource(stream).connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          sampleBufRef.current = new Float32Array(analyser.fftSize);
        }
      } catch {
        closeMeter();
      }

      const mimeType = pickMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      chunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = mimeTypeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        clearTimer();
        closeMeter();
        stopTracks();
        mediaRecorderRef.current = null;
        setRecording(false);
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        if (resolve) resolve(blob);
      };

      startTimestampRef.current = Date.now();
      setDurationSec(0);
      recorder.start();

      clearTimer();
      timerRef.current = setInterval(() => {
        setDurationSec((Date.now() - startTimestampRef.current) / 1000);
        setLevel(readLevel());
      }, 100);

      setRecording(true);
    } catch (err: any) {
      stopTracks();
      clearTimer();
      closeMeter();
      setRecording(false);
      setError(mapGetUserMediaError(err));
    }
  }, [clearTimer, closeMeter, readLevel, stopTracks]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise<Blob | null>((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        clearTimer();
        closeMeter();
        stopTracks();
        setRecording(false);
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        clearTimer();
        closeMeter();
        stopTracks();
        setRecording(false);
        stopResolveRef.current = null;
        resolve(null);
      }
    });
  }, [clearTimer, closeMeter, stopTracks]);

  const reset = useCallback(() => {
    setDurationSec(0);
    setLevel(0);
    setError(null);
    chunksRef.current = [];
    startTimestampRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      analyserRef.current = null;
      sampleBufRef.current = null;
      if (ctx && ctx.state !== "closed") {
        try {
          void ctx.close();
        } catch {
          /* fermeture best effort */
        }
      }
    };
  }, []);

  return { recording, durationSec, level, error, supported, start, stop, reset };
}
