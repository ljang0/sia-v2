import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, normalize } from 'node:path';
import type { AttachmentView, BridgeRequestMap, BridgeResultMap } from '../../shared/bridge.js';
import { savePastedAttachment } from '../pasted-attachments.js';
import {
  attachmentKind,
  previewImageMimeType,
  textAttachmentPreview,
} from './attachment-files.js';
import type { ControllerContext } from './context.js';
import type { AttachmentGrant } from './types.js';

/** Grants the files a person picks or pastes to a thread, and previews, opens and reveals them. */
export class Attachments {
  readonly grants = new Map<string, AttachmentGrant>();

  constructor(private readonly ctx: ControllerContext) {}

  async pickAttachments(threadId: string): Promise<BridgeResultMap['attachments.pick']> {
    if (!this.ctx.deps.chooseFiles)
      throw new Error('File attachments are unavailable in this build.');
    const selected = await this.ctx.deps.chooseFiles();
    return await this.grantAttachments(threadId, selected);
  }

  async pasteAttachment(
    input: BridgeRequestMap['attachments.paste'],
  ): Promise<BridgeResultMap['attachments.paste']> {
    if (!this.ctx.deps.pastedAttachmentRoot)
      throw new Error('Pasting files is unavailable in this build.');
    this.ctx.requireThread(input.threadId);
    const path = await savePastedAttachment(this.ctx.deps.pastedAttachmentRoot, input);
    return await this.grantAttachments(input.threadId, [path]);
  }

  async grantAttachments(
    threadId: string,
    selected: readonly string[],
  ): Promise<BridgeResultMap['attachments.pick']> {
    // Files can be attached while the thread works; they travel with a queued follow-up.
    const thread = this.ctx.requireThread(threadId);
    if (selected.length > 20) throw new Error('Choose at most 20 files at a time.');
    const grants: AttachmentView[] = [];
    let totalBytes = 0;
    for (const path of selected) {
      if (!isAbsolute(path)) throw new Error('The native picker returned an invalid file.');
      const info = await stat(path);
      if (!info.isFile()) throw new Error('Attachments must be regular files.');
      if (info.size > 25 * 1024 * 1024) {
        throw new Error(`${basename(path)} is larger than the 25 MB attachment limit.`);
      }
      totalBytes += info.size;
      if (totalBytes > 100 * 1024 * 1024) {
        throw new Error('The selected attachments exceed the 100 MB combined limit.');
      }
      const kind = attachmentKind(path);
      const id = randomUUID();
      const view: AttachmentView = { id, name: basename(path), kind, bytes: info.size };
      this.grants.set(id, {
        threadId: thread.id,
        attachment: { kind, path: normalize(path), name: view.name },
        view,
        expiresAt: Date.now() + 60 * 60_000,
      });
      grants.push(view);
    }
    this.pruneAttachmentGrants();
    return { attachments: grants };
  }

  async previewAttachment(
    input: BridgeRequestMap['attachments.preview'],
  ): Promise<BridgeResultMap['attachments.preview']> {
    const grant = this.requireAttachmentGrant(input.threadId, input.attachmentId);
    const path = grant.attachment.path;
    const extension = extname(path).toLocaleLowerCase();
    if (extension === '.pdf') return { kind: 'pdf' };
    const mimeType = previewImageMimeType(path);
    const info = await stat(path);
    const textPreview = textAttachmentPreview(extension);
    if (textPreview) {
      if (info.size > 512 * 1024) {
        return {
          kind: 'unavailable',
          detail: 'Open this file to view it. Text previews are limited to 512 KB.',
        };
      }
      const content = await readFile(path, 'utf8');
      if (content.includes('\u0000')) {
        return { kind: 'unavailable', detail: 'This file does not contain previewable text.' };
      }
      return { kind: 'text', content, ...textPreview };
    }
    if (!mimeType) {
      return {
        kind: 'unavailable',
        detail: 'Preview is available for images, PDF metadata, and common text files.',
      };
    }
    if (info.size > 8 * 1024 * 1024) {
      return { kind: 'unavailable', detail: 'Open this image to view the full-size file.' };
    }
    const bytes = await readFile(path);
    return { kind: 'image', dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` };
  }

  async openAttachment(
    input: BridgeRequestMap['attachments.open'],
  ): Promise<BridgeResultMap['attachments.open']> {
    if (!this.ctx.deps.openPath)
      throw new Error('Opening local files is unavailable in this build.');
    const grant = this.requireAttachmentGrant(input.threadId, input.attachmentId);
    await this.ctx.deps.openPath(grant.attachment.path);
    return { opened: true };
  }

  async revealAttachment(
    input: BridgeRequestMap['attachments.reveal'],
  ): Promise<BridgeResultMap['attachments.reveal']> {
    if (!this.ctx.deps.revealDirectory)
      throw new Error('Finder reveal is unavailable in this build.');
    const grant = this.requireAttachmentGrant(input.threadId, input.attachmentId);
    await this.ctx.deps.revealDirectory(grant.attachment.path);
    return { revealed: true };
  }

  requireAttachmentGrant(threadId: string, attachmentId: string): AttachmentGrant {
    this.ctx.requireThread(threadId);
    this.pruneAttachmentGrants();
    const grant = this.grants.get(attachmentId);
    if (!grant || grant.threadId !== threadId) {
      throw new Error('This local file grant expired. Attach the file again to reopen it.');
    }
    return grant;
  }

  pruneAttachmentGrants(): void {
    const now = Date.now();
    for (const [id, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(id);
    }
  }
}
