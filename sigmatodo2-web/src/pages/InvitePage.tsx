import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { invitations as invitationsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDarkMode } from '@/lib/darkMode';
import { fileUrl } from '@/lib/files';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function InvitePage() {
  const { invitationCode } = useParams<{ invitationCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  useDarkMode();

  const { data: details, isLoading, error } = useQuery({
    queryKey: ['invitation', invitationCode],
    queryFn: () => invitationsApi.get(invitationCode!),
    enabled: !!invitationCode,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => invitationsApi.accept(invitationCode!),
    onSuccess: () => navigate(`/projects/${details!.projectCode}`),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !details) {
    const msg = (error as Error)?.message;
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-lg font-semibold">Invitation not available</p>
        <p className="text-sm text-muted-foreground">
          {msg ?? 'This invitation link is invalid, expired, or already used.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/')}>Go home</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Inviter */}
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={fileUrl(details.inviter.avatarPath)} />
            <AvatarFallback>
              {details.inviter.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm">
            <span className="font-semibold">{details.inviter.displayName}</span>
            {' '}invites you to join this project:
          </p>
        </div>

        {/* Project card */}
        <div className="rounded-lg border p-5 flex flex-col gap-3">
          {details.project.backgroundImgPath && (
            <img
              src={fileUrl(details.project.backgroundImgPath)}
              alt="Project background"
              className="w-full h-28 object-cover rounded-md"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{details.project.name}</h2>
              <span className="text-sm font-mono text-muted-foreground">{details.project.code}</span>
            </div>
            {details.project.description && (
              <p className="text-sm text-muted-foreground mt-1">{details.project.description}</p>
            )}
          </div>
        </div>

        {/* Expiry notice */}
        {details.expiresAt && (
          <p className="text-xs text-muted-foreground text-center">
            Expires {new Date(details.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' })}
          </p>
        )}

        {/* Action */}
        {user ? (
          <Button
            size="lg"
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
          >
            {accept.isPending ? 'Joining…' : 'Accept Invitation'}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 items-center">
            <p className="text-sm text-muted-foreground">Sign in to accept this invitation.</p>
            <Button size="lg" onClick={() => navigate(`/login?redirect=/invite/${invitationCode}`)}>Sign in</Button>
          </div>
        )}

        {accept.error && (
          <p className="text-sm text-destructive text-center">{(accept.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}
