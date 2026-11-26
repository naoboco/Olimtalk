import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Report } from '../../shared/types.ts';
import { me, requireAuth } from '../auth.ts';
import { getUser } from '../core.ts';
import { UPLOAD_DIR, db, type MessageRow } from '../db.ts';
import { emitToChat } from '../realtime.ts';
import { HttpError, bad, intParam, now, parse, rateLimiter } from '../util.ts';

export const router = Router();

// ───────────────────────── uploads ─────────────────────────

/**
 * Only formats that browsers render inertly are accepted, and the stored
 * extension is derived from the detected type (never from the client's file
 * name), so an upload can never be served back as HTML / SVG / script.
 */
const ALLOWED: Record<string, { ext: string; kind: 'image' | 'video' | 'audio' | 'file' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
  'audio/webm': { ext: 'weba', kind: 'audio' },
  'audio/ogg': { ext: 'ogg', kind: 'audio' },
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
  'audio/mp4': { ext: 'm4a', kind: 'audio' },
  'audio/wav': { ext: 'wav', kind: 'audio' },
  'audio/x-wav': { ext: 'wav', kind: 'audio' },
  'application/pdf': { ext: 'pdf', kind: 'file' },
  'text/plain': { ext: 'txt', kind: 'file' },
  'application/zip': { ext: 'zip', kind: 'file' },
  'application/msword': { ext: 'doc', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'file' },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'file' },
  'application/vnd.ms-powerpoint': { ext: 'ppt', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', kind: 'file' },
};

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
const uploadLimit = rateLimiter(40, 10 * 60_000);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const type = ALLOWED[file.mimetype.split(';')[0]!.trim().toLowerCase()];
      cb(null, `${crypto.randomBytes(16).toString('base64url')}.${type?.ext ?? 'bin'}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.split(';')[0]!.trim().toLowerCase();
    if (ALLOWED[mime]) cb(null, true);
    else cb(new HttpError(415, 'unsupported_file_type'));
  },
});

router.post('/upload', requireAuth, (req, res, next) => {
  if (!uploadLimit(me(req).id)) return next(new HttpError(429, 'too_many_requests'));
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'file_too_large'));
      return next(err);
    }
    const file = req.file;
    if (!file) return next(bad('no_file'));
    const mime = file.mimetype.split(';')[0]!.trim().toLowerCase();
    const type = ALLOWED[mime]!;
    // multer decodes file names as latin1; restore UTF-8 (Hebrew / Cyrillic names).
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    res.status(201).json({
      url: `/uploads/${file.filename}`,
      name: path.basename(original).slice(0, 200) || file.filename,
      size: file.size,
      mime,
      kind: type.kind,
    });
  });
});

// ───────────────────────── reports & moderation ─────────────────────────

const reportLimit = rateLimiter(20, 60 * 60_000);

router.post('/reports', requireAuth, (req, res) => {
  const user = me(req);
  if (!reportLimit(user.id)) throw new HttpError(429, 'too_many_requests');
  const body = parse(
    z.object({
      targetType: z.enum(['message', 'user', 'chat', 'story']),
      targetId: z.number().int().positive(),
      reason: z.enum(['spam', 'harassment', 'hate', 'scam', 'illegal', 'other']),
      details: z.string().trim().max(1000).default(''),
    }),
    req.body,
  );
  db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, details, created_at) VALUES (?,?,?,?,?,?)').run(
    user.id,
    body.targetType,
    body.targetId,
    body.reason,
    body.details,
    now(),
  );
  res.status(201).json({ ok: true });
});

function requireAdmin(req: Parameters<typeof me>[0]) {
  const user = me(req);
  if (!user.is_admin) throw new HttpError(403, 'forbidden');
  return user;
}

router.get('/admin/reports', requireAuth, (req, res) => {
  requireAdmin(req);
  const rows = db
    .prepare(
      `SELECT r.*, u.name AS reporter_name FROM reports r JOIN users u ON u.id = r.reporter_id
       ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 200`,
    )
    .all() as {
    id: number;
    reporter_id: number;
    reporter_name: string;
    target_type: Report['targetType'];
    target_id: number;
    reason: string;
    details: string;
    status: Report['status'];
    created_at: number;
  }[];
  const reports: Report[] = rows.map((r) => {
    let excerpt = '';
    let chatId: number | null = null;
    if (r.target_type === 'message') {
      const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(r.target_id) as MessageRow | undefined;
      excerpt = m ? (m.deleted_at ? '🚫' : m.text || m.type) : '—';
      chatId = m?.chat_id ?? null;
    } else if (r.target_type === 'user') {
      const u = getUser(r.target_id);
      excerpt = u ? `${u.name} (@${u.username})${u.banned ? ' 🚫' : ''}` : '—';
    } else if (r.target_type === 'chat') {
      const c = db.prepare('SELECT name FROM chats WHERE id = ?').get(r.target_id) as { name: string } | undefined;
      excerpt = c?.name ?? '—';
      chatId = r.target_id;
    } else {
      const s = db.prepare('SELECT text FROM stories WHERE id = ?').get(r.target_id) as { text: string } | undefined;
      excerpt = s ? s.text || 'story' : '—';
    }
    return {
      id: r.id,
      reporter: { id: r.reporter_id, name: r.reporter_name },
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      details: r.details,
      createdAt: r.created_at,
      status: r.status,
      excerpt: excerpt.slice(0, 300),
      chatId,
    };
  });
  res.json({ reports });
});

router.post('/admin/reports/:id', requireAuth, (req, res) => {
  requireAdmin(req);
  const id = intParam(req, 'id');
  const body = parse(z.object({ action: z.enum(['dismiss', 'remove', 'ban']) }), req.body);
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as
    | { id: number; target_type: Report['targetType']; target_id: number }
    | undefined;
  if (!report) throw new HttpError(404, 'report_not_found');
  if (body.action === 'remove') {
    if (report.target_type === 'message') {
      const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(report.target_id) as MessageRow | undefined;
      if (m && !m.deleted_at) {
        db.prepare('UPDATE messages SET deleted_at = ?, pinned_at = NULL WHERE id = ?').run(now(), m.id);
        emitToChat(m.chat_id, 'message:patch', {
          chatId: m.chat_id,
          id: m.id,
          patch: { deleted: true, text: '', attachment: null, pinnedAt: null },
        });
      }
    } else if (report.target_type === 'story') {
      db.prepare('DELETE FROM stories WHERE id = ?').run(report.target_id);
    } else if (report.target_type === 'chat') {
      emitToChat(report.target_id, 'chat:deleted', { chatId: report.target_id });
      db.prepare("DELETE FROM chats WHERE id = ? AND type = 'group'").run(report.target_id);
    }
  }
  if (body.action === 'ban') {
    let userId: number | undefined;
    if (report.target_type === 'user') userId = report.target_id;
    else if (report.target_type === 'message')
      userId = (db.prepare('SELECT user_id FROM messages WHERE id = ?').get(report.target_id) as { user_id: number } | undefined)?.user_id;
    else if (report.target_type === 'story')
      userId = (db.prepare('SELECT user_id FROM stories WHERE id = ?').get(report.target_id) as { user_id: number } | undefined)?.user_id;
    const target = userId ? getUser(userId) : undefined;
    if (target && !target.is_admin && !target.is_system) {
      db.prepare('UPDATE users SET banned = 1 WHERE id = ?').run(target.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
  }
  db.prepare("UPDATE reports SET status = 'closed' WHERE id = ?").run(id);
  res.json({ ok: true });
});
