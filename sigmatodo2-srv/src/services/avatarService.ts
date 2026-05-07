import type { User } from 'sigmatodo2-common';
import { getStorage } from '../storage/index';
import * as userRepo from '../repositories/userRepo';

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

export async function saveUserAvatar(handle: string, data: Uint8Array, mimeType: string): Promise<User> {
  if (!mimeType.startsWith('image/')) {
    throw new Error('Must be an image');
  }

  const avatarPath = await getStorage().saveAvatar(handle, data, mimeType);
  return userRepo.updateUser(handle, { avatarPath });
}

export async function fetchAndSaveUserAvatar(handle: string, url: string): Promise<User | null> {
  const res = await fetch(url);
  if (!res.ok) return null;

  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > MAX_AVATAR_BYTES) return null;

  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? 'image/jpeg';
  if (!mimeType.startsWith('image/')) return null;

  const data = new Uint8Array(await res.arrayBuffer());
  if (data.byteLength > MAX_AVATAR_BYTES) return null;

  return saveUserAvatar(handle, data, mimeType);
}
