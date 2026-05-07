import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListTodo, Pencil } from 'lucide-react';
import { users } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { user: me } = useAuth();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['user', handle],
    queryFn: () => users.get(handle!),
    enabled: !!handle,
  });

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar breadcrumbs={[{ label: 'My Projects', href: '/' }, { label: `@${handle}` }]} />
      <main className="flex-1 p-8 max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : isError || !user ? (
          <div className="text-muted-foreground">User not found or unavailable.</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-6">
              <Avatar className="size-20">
                <AvatarImage src={user.avatarPath ?? undefined} />
                <AvatarFallback className="text-2xl">
                  {user.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{user.displayName}</h1>
                <p className="text-muted-foreground">@{user.handle}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/profile/${handle}/issues`}>
                    <ListTodo className="size-4 mr-1" /> Issues
                  </Link>
                </Button>
                {me?.handle === handle && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/profile/${handle}/edit`}>
                      <Pencil className="size-4 mr-1" /> Edit
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            {user.bio && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{user.bio}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Member since {new Date(user.createdOn).toLocaleDateString()}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
