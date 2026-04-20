import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';

// All paths returned are relative to uploadsDir (e.g. "avatars/handle.jpg").
// Avatar/background paths are also served as /api/uploads/{relpath}.
export class FilesystemStorage {
  private base: string;

  constructor() {
    this.base = config.uploadsDir;
  }

  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async saveAvatar(handle: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const relPath = `avatars/${handle}.${ext}`;
    const fullPath = join(this.base, relPath);
    await this.ensureDir(join(this.base, 'avatars'));
    await Bun.write(fullPath, data);
    return `/api/uploads/${relPath}`;
  }

  async saveProjectBackground(projectCode: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const relPath = `projects/${projectCode}/bg.${ext}`;
    const fullPath = join(this.base, relPath);
    await this.ensureDir(join(this.base, 'projects', projectCode));
    await Bun.write(fullPath, data);
    return `/api/uploads/${relPath}`;
  }

  // Returns relative path from uploadsDir (stored in DB; served at /api/uploads/{path})
  async saveAttachment(issueCode: string, id: string, filename: string, data: Uint8Array): Promise<string> {
    const safeName = `${id}-${filename}`;
    const relPath = `attachments/${issueCode}/${safeName}`;
    const fullPath = join(this.base, relPath);
    await this.ensureDir(join(this.base, 'attachments', issueCode));
    await Bun.write(fullPath, data);
    return relPath;
  }

  // path may be a relative path from uploadsDir or a /api/uploads/ URL
  async deleteFile(storedPath: string): Promise<void> {
    const relPath = storedPath.startsWith('/api/uploads/')
      ? storedPath.slice('/api/uploads/'.length)
      : storedPath;
    await unlink(join(this.base, relPath)).catch(() => {});
  }

  resolveFullPath(relPath: string): string {
    return join(this.base, relPath);
  }

  getUploadsDir(): string {
    return this.base;
  }
}
