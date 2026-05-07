import * as userRepo from '../repositories/userRepo';
import { fetchAndSaveUserAvatar } from './avatarService';
import type { User } from 'sigmatodo2-common';

export async function handleGoogleUser(profile: {
  email: string;
  name: string;
  id: string;
  picture?: string;
}): Promise<{ user: User; isNew: boolean }> {
  let user = await userRepo.getUserByEmail(profile.email);
  const isNew = !user;

  if (!user) {
    const tempHandle = `user_${profile.id.slice(0, 8)}`;
    user = await userRepo.createUser({
      handle: tempHandle,
      displayName: profile.name,
      email: profile.email,
    });
    if (profile.picture) {
      user = await fetchAndSaveUserAvatar(tempHandle, profile.picture) ?? user;
    }
  }

  return { user, isNew };
}
