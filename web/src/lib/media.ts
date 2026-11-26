import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '../../../shared/types.ts';
import { api } from './api.ts';
import { uploadEncrypted } from './e2ee.ts';

const MAX_SIDE = 1920;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

/** Downscale large photos before upload (saves mobile data); GIFs are left untouched. */
async function prepareImage(file: File): Promise<{ blob: Blob; name: string; width: number; height: number }> {
  const img = await loadImage(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  if (file.type === 'image/gif' || (scale === 1 && file.size < 600_000)) return { blob: file, name: file.name, width: w, height: h };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob || blob.size >= file.size) return { blob: file, name: file.name, width: w, height: h };
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', width: canvas.width, height: canvas.height };
}

function videoMeta(file: Blob): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (meta: { width?: number; height?: number; duration?: number }) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    v.preload = 'metadata';
    v.onloadedmetadata = () =>
      done({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration: Number.isFinite(v.duration) ? v.duration : undefined });
    v.onerror = () => done({});
    setTimeout(() => done({}), 4000);
    v.src = url;
  });
}

const KINDS: [string, Attachment['kind']][] = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
];
const kindOf = (mime: string): Attachment['kind'] => KINDS.find(([prefix]) => mime.startsWith(prefix))?.[1] ?? 'file';

/**
 * Upload a file picked by the user and return the attachment to send.
 * With `secret`, the file is encrypted on the device first (private conversations).
 */
export async function uploadFile(file: File, secret = false): Promise<Attachment> {
  let blob: Blob = file;
  let name = file.name;
  let dims: { width?: number; height?: number; duration?: number } = {};
  if (file.type.startsWith('image/')) {
    const img = await prepareImage(file).catch(() => null);
    if (img) {
      blob = img.blob;
      name = img.name;
      dims = { width: img.width, height: img.height };
    }
  } else if (file.type.startsWith('video/')) {
    dims = await videoMeta(file);
  }
  if (secret) return uploadEncrypted(blob, { name, mime: blob.type || file.type || 'application/octet-stream', kind: kindOf(blob.type || file.type), ...dims });
  return { ...(await api.upload(blob, name)), ...dims };
}

export async function uploadVoice(blob: Blob, duration: number, secret = false): Promise<Attachment> {
  const type = blob.type.split(';')[0] || 'audio/webm';
  const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'weba';
  // Re-wrap so that the upload carries a bare MIME type the server recognises.
  const clean = new Blob([blob], { type });
  if (secret) return uploadEncrypted(clean, { name: `voice.${ext}`, mime: type, kind: 'audio', voice: true, duration });
  const a = await api.upload(clean, `voice.${ext}`);
  return { ...a, kind: 'audio', voice: true, duration };
}

/** Voice-note recorder built on MediaRecorder. */
export function useRecorder(onDone: (blob: Blob, seconds: number) => void, onError: () => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const cleanup = () => {
    clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setRecording(false);
    setSeconds(0);
  };

  useEffect(() => cleanup, []);

  const start = async () => {
    if (rec.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        const duration = (Date.now() - started.current) / 1000;
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        const wasCancelled = cancelled.current;
        cleanup();
        if (!wasCancelled && blob.size > 0 && duration >= 0.6) onDone(blob, duration);
      };
      rec.current = r;
      started.current = Date.now();
      r.start();
      setRecording(true);
      timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    } catch {
      cleanup();
      onError();
    }
  };

  const stop = (cancel = false) => {
    cancelled.current = cancel;
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    else cleanup();
  };

  return { recording, seconds, start, stop };
}
