import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { users } from '@/lib/api';
import { fileUrl } from '@/lib/files';
import TopBar from '@/components/TopBar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function EditProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user: me, refreshUser } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    displayName: me?.displayName ?? '',
    bio: me?.bio ?? '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(fileUrl(me?.avatarPath) ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      const updated = await users.update(handle!, {
        displayName: form.displayName,
        bio: form.bio || null,
      });
      if (pendingFile) {
        await users.uploadAvatar(handle!, pendingFile);
      }
      return updated;
    },
    onSuccess: async () => {
      await refreshUser();
      qc.invalidateQueries({ queryKey: ['user', handle] });
      navigate(`/profile/${handle}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (me?.handle !== handle) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Forbidden</div>;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar breadcrumbs={[
        { label: 'My Projects', href: '/' },
        { label: `@${handle}`, href: `/profile/${handle}` },
        { label: 'Edit' },
      ]} />
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-6">Edit Profile</h1>
        <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-20 cursor-pointer" onClick={() => fileRef.current?.click()}>
              <AvatarImage src={fileUrl(avatarPreview)} />
              <AvatarFallback className="text-2xl">
                {form.displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Change avatar
              </Button>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF up to 10 MB</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="space-y-1">
            <Label>Display name</Label>
            <Input
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Bio <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              maxLength={500}
              placeholder="Tell your teammates about yourself…"
            />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(`/profile/${handle}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
