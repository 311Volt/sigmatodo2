import { IS_PROD } from '../config';
import { FilesystemStorage } from './filesystem';
import { SupabaseStorage } from './supabase';

export type Storage = FilesystemStorage | SupabaseStorage;

let _storage: Storage | null = null;

export function getStorage(): Storage {
  if (!_storage) {
    _storage = IS_PROD ? new SupabaseStorage() : new FilesystemStorage();
  }
  return _storage;
}
