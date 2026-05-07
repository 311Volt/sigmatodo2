import { useState } from 'react';
import type { ElementType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ArrowUp, ChevronsUp, MessageSquare } from 'lucide-react';
import { users } from '@/lib/api';
import { fileUrl } from '@/lib/files';
import { formatTimeLeft } from '@/lib/time';
import TopBar from '@/components/TopBar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { IssueWithAssignee, SortOption } from 'sigmatodo2-common';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevant', label: 'Relevant' },
  { value: 'created', label: 'Date created' },
  { value: 'due', label: 'Due date' },
  { value: 'comments', label: 'Most comments' },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-blue-500',
  normal: 'text-yellow-500',
  high: 'text-orange-500',
  highest: 'text-red-500',
};

const PRIORITY_ICONS: Record<string, ElementType> = {
  low: ArrowDown,
  normal: ArrowRight,
  high: ArrowUp,
  highest: ChevronsUp,
};

export default function UserIssuesPage() {
  const { handle } = useParams<{ handle: string }>();
  const [sort, setSort] = useState<SortOption>('relevant');

  const { data: user, isLoading: userLoading, isError: userError } = useQuery({
    queryKey: ['user', handle],
    queryFn: () => users.get(handle!),
    enabled: !!handle,
  });

  const { data: issueList = [], isLoading: issuesLoading, isError: issuesError } = useQuery({
    queryKey: ['userIssues', handle, sort],
    queryFn: () => users.issues(handle!, sort),
    enabled: !!handle && !userError,
  });

  const isLoading = userLoading || issuesLoading;
  const hasError = userError || issuesError;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar breadcrumbs={[
        { label: 'My Projects', href: '/' },
        { label: `@${handle}`, href: `/profile/${handle}` },
        { label: 'Issues' },
      ]} />
      <main className="flex-1 p-8 max-w-3xl mx-auto w-full">
        {isLoading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : hasError || !user ? (
          <div className="text-muted-foreground">You do not have access to this user's issues.</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarImage src={fileUrl(user.avatarPath)} />
                <AvatarFallback className="text-xl">
                  {user.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold">Assigned Issues</h1>
                <p className="text-muted-foreground truncate">{user.displayName} (@{user.handle})</p>
              </div>
              <Select value={sort} onValueChange={v => setSort(v as SortOption)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {issueList.length === 0 ? (
              <div className="text-sm text-muted-foreground border-t pt-6">
                No assigned issues are visible to you.
              </div>
            ) : (
              <div className="border-t">
                {issueList.map(issue => (
                  <UserIssueRow key={issue.code} issue={issue} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function UserIssueRow({ issue }: { issue: IssueWithAssignee }) {
  const Icon = PRIORITY_ICONS[issue.priority];
  const timeLeft = formatTimeLeft(issue.dueBy);

  return (
    <Link
      to={`/projects/${issue.projectCode}/issues/${issue.code}`}
      className="relative block border-b py-3 pr-12 hover:bg-accent/60 transition-colors"
    >
      {issue.commentCount > 0 && (
        <div className="absolute right-1 top-3 flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="size-3" />
          <span>{issue.commentCount}</span>
        </div>
      )}
      <div className="flex items-center gap-2 mb-1.5">
        {Icon && <Icon className={`size-3.5 shrink-0 ${PRIORITY_COLORS[issue.priority] ?? ''}`} />}
        <span className="text-xs text-muted-foreground font-mono">{issue.code}</span>
        <Badge variant="outline" className="rounded-md px-1.5 py-0 text-[11px]">
          {issue.projectCode}
        </Badge>
        <span className="text-xs text-muted-foreground">{issue.status}</span>
      </div>
      <p className="text-sm font-medium leading-snug line-clamp-2">{issue.title}</p>
      {timeLeft && (
        <p className={`text-xs mt-1 ${timeLeft.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
          {timeLeft.text}
        </p>
      )}
    </Link>
  );
}
