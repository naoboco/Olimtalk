// Optional built-in mail reception (SMTP_PORT): lets people forward e-mails to their
// private OlimTalk address when the server can receive mail directly. Hosts that
// cannot open port 25 use the HTTP route /api/inbound/email instead.
import fs from 'node:fs';
import { SMTPServer } from 'smtp-server';
import { ingestEmail, mailEnabled, recipientOf } from './routes/connect.ts';

const MAX_MAIL = 10 * 1024 * 1024;

/**
 * The operator's own certificate for incoming mail (SMTP_TLS_KEY / SMTP_TLS_CERT, two file
 * paths). Without one the library falls back to a certificate everybody knows: sending
 * servers still encrypt the transfer, but cannot check who they are talking to.
 */
function tlsOptions(): { key?: Buffer; cert?: Buffer } {
  const { SMTP_TLS_KEY, SMTP_TLS_CERT } = process.env;
  if (!SMTP_TLS_KEY || !SMTP_TLS_CERT) return {};
  try {
    return { key: fs.readFileSync(SMTP_TLS_KEY), cert: fs.readFileSync(SMTP_TLS_CERT) };
  } catch (e) {
    console.error('[olimtalk] smtp: cannot read SMTP_TLS_KEY / SMTP_TLS_CERT:', (e as Error).message);
    return {};
  }
}

export function startSmtp(port: number): SMTPServer | null {
  if (!mailEnabled()) {
    console.warn('[olimtalk] SMTP_PORT is set but MAIL_DOMAIN is not: mail reception stays off');
    return null;
  }
  const server = new SMTPServer({
    name: process.env.MAIL_DOMAIN,
    banner: 'OlimTalk',
    size: MAX_MAIL,
    // This server only receives for its own addresses: nobody logs in, nothing is relayed.
    authOptional: true,
    disabledCommands: ['AUTH'],
    ...tlsOptions(),
    onRcptTo(address, _session, callback) {
      if (recipientOf(address.address)) return callback();
      callback(Object.assign(new Error('Unknown recipient'), { responseCode: 550 }));
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= MAX_MAIL) chunks.push(chunk);
      });
      stream.on('end', () => {
        if (size > MAX_MAIL || stream.sizeExceeded) {
          return callback(Object.assign(new Error('Message too large'), { responseCode: 552 }));
        }
        const raw = Buffer.concat(chunks);
        Promise.all(session.envelope.rcptTo.map((rcpt) => ingestEmail(rcpt.address, raw)))
          .then((results) => {
            if (results.some((r) => r === 'stored')) return callback();
            // e.g. the recipient has not opened OlimTalk yet and has no key to encrypt to
            callback(Object.assign(new Error('Message could not be delivered'), { responseCode: 451 }));
          })
          .catch(() => callback(Object.assign(new Error('Temporary failure'), { responseCode: 451 })));
      });
    },
  });
  server.on('error', (err) => console.error('[olimtalk] smtp:', err.message));
  server.listen(port, () => console.log(`[olimtalk] receiving mail for @${process.env.MAIL_DOMAIN} on port ${port}`));
  return server;
}
