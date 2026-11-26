// Sharing outside OlimTalk: WhatsApp, Facebook, Telegram, Instagram (via an image card), e-mail…
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import QRCode from 'qrcode';
import { IS_NATIVE, PUBLIC_ORIGIN } from './platform.ts';

export interface SharePayload {
  /** Headline of what is shared (group name, event title…). */
  title: string;
  /** Short invitation text placed before the link. */
  text: string;
  url: string;
  emoji?: string;
  subtitle?: string;
  /** Call-to-action printed on the image card. */
  cta?: string;
}

export const inviteUrl = (code: string) => `${PUBLIC_ORIGIN}/join/${code}`;

const enc = encodeURIComponent;

export function whatsappUrl(p: SharePayload) {
  return `https://wa.me/?text=${enc(`${p.text}\n${p.url}`)}`;
}
export function facebookUrl(p: SharePayload) {
  return `https://www.facebook.com/sharer/sharer.php?u=${enc(p.url)}`;
}
export function telegramUrl(p: SharePayload) {
  return `https://t.me/share/url?url=${enc(p.url)}&text=${enc(p.text)}`;
}
export function xUrl(p: SharePayload) {
  return `https://twitter.com/intent/tweet?text=${enc(p.text)}&url=${enc(p.url)}`;
}
export function emailUrl(p: SharePayload) {
  return `mailto:?subject=${enc(p.title)}&body=${enc(`${p.text}\n\n${p.url}`)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function canNativeShare(): boolean {
  return IS_NATIVE || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
}

const toBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Open the system share sheet (where WhatsApp, Instagram, Facebook… appear), with an
 * image when one is given. Resolves false when unavailable or dismissed.
 */
export async function nativeShare(p: SharePayload, file?: File): Promise<boolean> {
  if (IS_NATIVE) {
    try {
      if (file) {
        // The share sheet needs a real file: write the image to the app's cache first.
        const saved = await Filesystem.writeFile({ path: file.name || 'olimtalk.png', data: await toBase64(file), directory: Directory.Cache });
        await Share.share({ title: p.title, text: `${p.text}\n${p.url}`, files: [saved.uri], dialogTitle: p.title });
      } else {
        await Share.share({ title: p.title, text: p.text, url: p.url, dialogTitle: p.title });
      }
      return true;
    } catch {
      return false;
    }
  }
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    if (file) {
      if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) return false;
      await navigator.share({ files: [file], title: p.title, text: `${p.text}\n${p.url}` });
    } else {
      await navigator.share({ title: p.title, text: p.text, url: p.url });
    }
    return true;
  } catch {
    return false;
  }
}

export function qrDataUrl(url: string, size = 512): Promise<string> {
  return QRCode.toDataURL(url, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#FFFFFF' } });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let lastLine = lines[maxLines - 1]!;
    while (lastLine.length > 1 && ctx.measureText(lastLine + '…').width > maxWidth) lastLine = lastLine.slice(0, -1);
    lines[maxLines - 1] = lastLine + '…';
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/**
 * Draw a 1080×1920 "story" card (the format Instagram, WhatsApp status and
 * Facebook stories expect) with the title, a QR code and the link.
 */
export async function makeShareCard(p: SharePayload): Promise<File> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (size: number, weight = 700) =>
    `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2F6BFF');
  bg.addColorStop(1, '#12A594');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // soft sun
  const sun = ctx.createRadialGradient(W * 0.86, H * 0.1, 0, W * 0.86, H * 0.1, 520);
  sun.addColorStop(0, 'rgba(255,197,61,0.55)');
  sun.addColorStop(1, 'rgba(255,197,61,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = font(54, 800);
  ctx.fillText('OlimTalk', W / 2, 190);

  // white card
  const cx = 90;
  const cy = 330;
  const cw = W - 180;
  const ch = 1260;
  ctx.shadowColor = 'rgba(8,20,60,0.28)';
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, cx, cy, cw, ch, 64);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // emoji badge
  ctx.fillStyle = '#E6EEFF';
  ctx.beginPath();
  ctx.arc(W / 2, cy + 190, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(120, 400);
  ctx.fillStyle = '#111827';
  ctx.fillText(p.emoji || '💬', W / 2, cy + 198);

  ctx.fillStyle = '#111827';
  ctx.font = font(68, 800);
  const titleLines = wrapLines(ctx, p.title, cw - 140, 3);
  let y = cy + 390;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, y);
    y += 84;
  }
  if (p.subtitle) {
    ctx.fillStyle = '#5E6577';
    ctx.font = font(40, 500);
    for (const line of wrapLines(ctx, p.subtitle, cw - 160, 2)) {
      ctx.fillText(line, W / 2, y + 10);
      y += 54;
    }
  }

  const qr = await loadImage(await qrDataUrl(p.url, 520));
  const qs = 440;
  const qy = cy + ch - qs - 190;
  ctx.drawImage(qr, (W - qs) / 2, qy, qs, qs);

  ctx.fillStyle = '#2F6BFF';
  ctx.font = font(36, 700);
  const shortUrl = p.url.replace(/^https?:\/\//, '');
  ctx.fillText(wrapLines(ctx, shortUrl, cw - 120, 1)[0]!, W / 2, cy + ch - 110);

  if (p.cta) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(52, 800);
    const lines = wrapLines(ctx, p.cta, W - 200, 2);
    let ty = cy + ch + 130;
    for (const line of lines) {
      ctx.fillText(line, W / 2, ty);
      ty += 66;
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
  return new File([blob], 'olimtalk.png', { type: 'image/png' });
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
