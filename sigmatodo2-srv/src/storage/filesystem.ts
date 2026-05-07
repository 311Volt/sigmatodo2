import { mkdir, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { config } from '../config';
import { extensionFromMimeType, requireStoragePath, safeStorageFilename } from './paths';
import type { StoredFile } from './types';

// All paths returned are relative to uploadsDir (e.g. "avatars/handle.jpg").
export class FilesystemStorage {
  private base: string;

  constructor() {
    this.base = config.uploadsDir;
  }

  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async uploadFile(path: string, data: Uint8Array, mimeType: string): Promise<string> {
    const relPath = requireStoragePath(path);
    const fullPath = join(this.base, relPath);
    await this.ensureDir(dirname(fullPath));
    await Bun.write(fullPath, data);
    return relPath;
  }

  async getFile(path: string): Promise<StoredFile | null> {
    const relPath = requireStoragePath(path);
    const file = Bun.file(join(this.base, relPath));
    if (!await file.exists()) return null;

    return {
      data: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || 'application/octet-stream',
    };
  }

  async saveAvatar(handle: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = extensionFromMimeType(mimeType, 'jpg');
    const relPath = `avatars/${handle}.${ext}`;
    return this.uploadFile(relPath, data, mimeType);
  }

  async saveProjectBackground(projectCode: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = extensionFromMimeType(mimeType, 'jpg');
    const relPath = `projects/${projectCode}/bg.${ext}`;
    return this.uploadFile(relPath, data, mimeType);
  }

  // Returns relative path from uploadsDir (stored in DB; served through /api/files/{path})
  async saveAttachment(issueCode: string, id: string, filename: string, data: Uint8Array): Promise<string> {
    const safeName = `${id}-${safeStorageFilename(filename)}`;
    const relPath = `attachments/${issueCode}/${safeName}`;
    return this.uploadFile(relPath, data, 'application/octet-stream');
  }

  async deleteFile(storedPath: string): Promise<void> {
    const relPath = requireStoragePath(storedPath);
    await unlink(join(this.base, relPath)).catch(() => {});
  }

  resolveFullPath(relPath: string): string {
    return join(this.base, requireStoragePath(relPath));
  }

  getUploadsDir(): string {
    return this.base;
  }
}
