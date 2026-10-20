// Files a user attaches to a Jarvis message: photos, screenshots, PDFs, Office
// documents. They go to Claude through the Anthropic Files API, so the
// conversation history holds only a file_id — re-sending a PDF's bytes with
// every later question would bloat each request and the stored conversation.
//
// Images and PDFs are passed as they are, so Claude sees the actual page or
// photo (layout, stamps, charts), not just its text. Word, Excel, PowerPoint
// and text files are turned into text first (documents.js) and uploaded as a
// plain-text document, since Claude reads only PDFs and text as documents.
//
// Uploading and sending are two steps: the browser uploads while the user is
// still typing, then sends the message with the upload ids. Until it is sent
// an upload is held here, for its own user only; once sent it belongs to the
// conversation, and is deleted with it (or expires after 90 days).

import crypto from 'node:crypto';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { DocumentTextError, documentText } from './documents.js';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
// Claude's limit for one image.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FILE_LIFETIME_SECONDS = 90 * 24 * 3600;
const PENDING_TTL_MS = 3600 * 1000;

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export class AttachmentError extends Error {}

let client = null;
const anthropic = () => {
  if (!client) client = new Anthropic();
  return client;
};

const extensionOf = (name) => String(name ?? '').toLowerCase().split('.').pop() ?? '';

// Which way a file goes to Claude: as an image, as a PDF, or as text.
export function attachmentKind(name, mimeType) {
  const extension = extensionOf(name);
  const type = String(mimeType ?? '').toLowerCase();
  if (IMAGE_TYPES[extension] || Object.values(IMAGE_TYPES).includes(type)) return 'image';
  if (extension === 'heic' || extension === 'heif' || type.includes('heic') || type.includes('heif')) {
    throw new AttachmentError('Fotky ve formátu HEIC (iPhone) neumím přečíst – pošlete je jako JPG nebo PNG.');
  }
  if (extension === 'pdf' || type === 'application/pdf') return 'pdf';
  return 'text';
}

async function uploadToAnthropic(buffer, filename, mimeType) {
  const file = await anthropic().files.upload({
    file: await toFile(buffer, filename, { type: mimeType }),
    expires_in_seconds: FILE_LIFETIME_SECONDS,
  });
  return file.id;
}

/**
 * Prepare one uploaded file for Claude. Returns what the chat request needs:
 * { kind, name, size, fileId, mediaType, note? }.
 */
export async function prepareAttachment(buffer, { name, mimeType, signal }) {
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError('Soubor je větší než 25 MB.');
  const kind = attachmentKind(name, mimeType);

  if (kind === 'image') {
    if (buffer.length > MAX_IMAGE_BYTES) throw new AttachmentError('Obrázek je větší než 5 MB.');
    const mediaType = IMAGE_TYPES[extensionOf(name)] ?? mimeType;
    return { kind, name, size: buffer.length, mediaType, fileId: await uploadToAnthropic(buffer, name, mediaType) };
  }
  if (kind === 'pdf') {
    return { kind, name, size: buffer.length, mediaType: 'application/pdf', fileId: await uploadToAnthropic(buffer, name, 'application/pdf') };
  }

  // Office and text files: their text, as a plain-text document.
  let extracted;
  try {
    extracted = await documentText(buffer, { filename: name, mimeType, signal });
  } catch (error) {
    if (error instanceof DocumentTextError) throw new AttachmentError(error.message);
    throw error;
  }
  if (!extracted.text) throw new AttachmentError('V souboru není žádný čitelný text.');
  const textName = `${name.replace(/\.[^.]+$/, '')}.txt`;
  return {
    kind: 'text',
    name,
    size: buffer.length,
    mediaType: 'text/plain',
    fileId: await uploadToAnthropic(Buffer.from(extracted.text, 'utf8'), textName, 'text/plain'),
  };
}

// The content block a prepared attachment becomes in the user's message.
export function attachmentBlock(attachment) {
  if (attachment.kind === 'image') return { type: 'image', source: { type: 'file', file_id: attachment.fileId } };
  return { type: 'document', source: { type: 'file', file_id: attachment.fileId }, title: attachment.name.slice(0, 200) };
}

// Every Files API id a stored conversation refers to.
export function conversationFileIds(messages) {
  const ids = new Set();
  for (const message of messages ?? []) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.source?.type === 'file' && block.source.file_id) ids.add(block.source.file_id);
    }
  }
  return [...ids];
}

export async function deleteFiles(fileIds) {
  await Promise.all(
    fileIds.map((id) =>
      anthropic()
        .files.delete(id)
        .catch((error) => {
          // Already gone (expired or deleted) is fine.
          if (!(error instanceof Anthropic.NotFoundError)) console.warn('Jarvis: deleting an attachment failed:', error?.message ?? error);
        })
    )
  );
}

// Uploads waiting to be sent, keyed by an id the browser holds.
export function createPendingAttachments() {
  const pending = new Map();

  const sweep = () => {
    const cutoff = Date.now() - PENDING_TTL_MS;
    const stale = [...pending].filter(([, entry]) => entry.at < cutoff);
    for (const [id] of stale) pending.delete(id);
    if (stale.length) void deleteFiles(stale.map(([, entry]) => entry.attachment.fileId));
  };
  setInterval(sweep, 10 * 60 * 1000).unref?.();

  return {
    add(userId, attachment) {
      const id = crypto.randomUUID();
      pending.set(id, { userId, attachment, at: Date.now() });
      return id;
    },
    // The user's own pending uploads for these ids, or null if any is unknown
    // (sent already, expired, or someone else's).
    take(userId, ids) {
      const entries = ids.map((id) => pending.get(id));
      if (entries.some((entry) => !entry || entry.userId !== userId)) return null;
      for (const id of ids) pending.delete(id);
      return entries.map((entry) => entry.attachment);
    },
    async remove(userId, id) {
      const entry = pending.get(id);
      if (!entry || entry.userId !== userId) return false;
      pending.delete(id);
      await deleteFiles([entry.attachment.fileId]);
      return true;
    },
  };
}
