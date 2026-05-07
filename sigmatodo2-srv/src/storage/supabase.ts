import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { extensionFromMimeType, requireStoragePath, safeStorageFilename } from './paths';
import type { StoredFile } from './types';

export class SupabaseStorage {
  private client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  private get storage() {
    return this.client.storage;
  }

  async uploadFile(path: string, data: Uint8Array, mimeType: string, upsert = false): Promise<string> {
    const storagePath = requireStoragePath(path);
    const { error } = await this.storage
      .from('uploads')
      .upload(storagePath, data, { contentType: mimeType, upsert });
    if (error) throw error;
    return storagePath;
  }

  async getFile(path: string): Promise<StoredFile | null> {
    const storagePath = requireStoragePath(path);
    const { data, error } = await this.storage.from('uploads').download(storagePath);
    if (error || !data) return null;

    return {
      data: new Uint8Array(await data.arrayBuffer()),
      contentType: data.type || 'application/octet-stream',
    };
  }

  async saveAvatar(handle: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = extensionFromMimeType(mimeType, 'jpg');
    const path = `avatars/${handle}.${ext}`;
    return this.uploadFile(path, data, mimeType, true);
  }

  async saveProjectBackground(projectCode: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = extensionFromMimeType(mimeType, 'jpg');
    const path = `projects/${projectCode}/bg.${ext}`;
    return this.uploadFile(path, data, mimeType, true);
  }

  async saveAttachment(issueCode: string, id: string, filename: string, data: Uint8Array, mimeType: string): Promise<string> {
    const path = `attachments/${issueCode}/${id}-${safeStorageFilename(filename)}`;
    return this.uploadFile(path, data, mimeType);
  }

  async deleteFile(path: string): Promise<void> {
    const storagePath = requireStoragePath(path);
    await this.storage.from('uploads').remove([storagePath]);
  }
}
