import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

export class SupabaseStorage {
  private client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  private get storage() {
    return this.client.storage;
  }

  async saveAvatar(handle: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const path = `avatars/${handle}.${ext}`;
    await this.storage.from('uploads').upload(path, data, { contentType: mimeType, upsert: true });
    const { data: urlData } = this.storage.from('uploads').getPublicUrl(path);
    return urlData.publicUrl;
  }

  async saveProjectBackground(projectCode: string, data: Uint8Array, mimeType: string): Promise<string> {
    const ext = mimeType.split('/')[1] ?? 'jpg';
    const path = `projects/${projectCode}/bg.${ext}`;
    await this.storage.from('uploads').upload(path, data, { contentType: mimeType, upsert: true });
    const { data: urlData } = this.storage.from('uploads').getPublicUrl(path);
    return urlData.publicUrl;
  }

  async saveAttachment(issueCode: string, id: string, filename: string, data: Uint8Array, mimeType: string): Promise<string> {
    const path = `attachments/${issueCode}/${id}-${filename}`;
    await this.storage.from('uploads').upload(path, data, { contentType: mimeType });
    return path;
  }

  async getAttachmentUrl(path: string): Promise<string> {
    const { data } = await this.storage.from('uploads').createSignedUrl(path, 3600);
    return data?.signedUrl ?? '';
  }

  async deleteFile(path: string): Promise<void> {
    const storagePath = path.startsWith('attachments/') || path.startsWith('avatars/') || path.startsWith('projects/')
      ? path
      : path.replace(/^\//, '');
    await this.storage.from('uploads').remove([storagePath]);
  }
}
