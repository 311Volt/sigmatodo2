import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, ArrowDown, ArrowRight, ArrowUp, ChevronsUp } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { issues as issuesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatTimeLeft } from '@/lib/time';
import type { IssueWithAssignee, SortOption, StatusDefinition } from 'sigmatodo2-common';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevant', label: 'Relevant' },
  { value: 'created', label: 'Date created' },
  { value: 'due', label: 'Due date' },
  { value: 'comments', label: 'Most comments' },
];

interface IssueListProps {
  projectCode: string;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  selectedCode: string | null;
  onSelect: (code: string | null) => void;
  statusDefinitions: StatusDefinition[];
}

export default function IssueList({
  projectCode, sort, onSortChange, selectedCode, onSelect, statusDefinitions,
}: IssueListProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ title: '', status: '', priority: 'normal' });
  const [newError, setNewError] = useState('');

  const { data: allIssues = [], isLoading } = useQuery({
    queryKey: ['issues', projectCode, sort],
    queryFn: () => issuesApi.list(projectCode, sort),
  });

  const create = useMutation({
    mutationFn: () => issuesApi.create(projectCode, {
      title: newForm.title,
      status: newForm.status || (statusDefinitions[0]?.code ?? 'TODO'),
      priority: newForm.priority,
    }),
    onSuccess: issue => {
      qc.invalidateQueries({ queryKey: ['issues', projectCode] });
      setNewOpen(false);
      setNewForm({ title: '', status: '', priority: 'normal' });
      onSelect(issue.code);
    },
    onError: (err: Error) => setNewError(err.message),
  });

  const statusMap = Object.fromEntries(statusDefinitions.map(s => [s.code, s]));
  const myHandle = user?.handle ?? null;
  const myIssues = allIssues.filter(i => i.assignedTo === myHandle);
  const otherIssues = allIssues.filter(i => i.assignedTo !== myHandle);

  const defaultStatus = statusDefinitions[0]?.code ?? 'TODO';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b">
        <Select value={sort} onValueChange={v => onSortChange(v as SortOption)}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={() => { setNewOpen(true); setNewError(''); }}>
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-8">Loading…</div>
        ) : allIssues.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">No issues yet</div>
        ) : (
          <>
            {myIssues.length > 0 && (
              <IssueSection
                title="My Issues"
                issues={myIssues}
                selectedCode={selectedCode}
                onSelect={onSelect}
                statusMap={statusMap}
                myHandle={myHandle}
              />
            )}
            <IssueSection
              title={myIssues.length > 0 ? 'Issues' : undefined}
              issues={otherIssues}
              selectedCode={selectedCode}
              onSelect={onSelect}
              statusMap={statusMap}
              myHandle={myHandle}
            />
          </>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Issue</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); create.mutate(); }} className="flex flex-col gap-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={newForm.title}
                onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Issue title"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={newForm.status || defaultStatus}
                  onValueChange={v => setNewForm(f => ({ ...f, status: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusDefinitions.map(s => (
                      <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={newForm.priority}
                  onValueChange={v => setNewForm(f => ({ ...f, priority: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['low', 'normal', 'high', 'highest'] as const).map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newError && <p className="text-destructive text-sm">{newError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IssueSection({
  title, issues, selectedCode, onSelect, statusMap, myHandle,
}: {
  title?: string;
  issues: IssueWithAssignee[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  statusMap: Record<string, { name: string; bgColor: string; isActive: boolean }>;
  myHandle: string | null;
}) {
  if (issues.length === 0) return null;
  return (
    <div>
      {title && (
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </div>
      )}
      {issues.map(issue => (
        <IssueRow
          key={issue.code}
          issue={issue}
          selected={issue.code === selectedCode}
          onSelect={() => onSelect(issue.code)}
          statusMap={statusMap}
          myHandle={myHandle}
        />
      ))}
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-blue-500',
  normal: 'text-yellow-500',
  high: 'text-orange-500',
  highest: 'text-red-500',
};

const PRIORITY_ICONS: Record<string, React.ElementType> = {
  low: ArrowDown,
  normal: ArrowRight,
  high: ArrowUp,
  highest: ChevronsUp,
};

function IssueRow({
  issue, selected, onSelect, statusMap, myHandle,
}: {
  issue: IssueWithAssignee;
  selected: boolean;
  onSelect: () => void;
  statusMap: Record<string, { name: string; bgColor: string; isActive: boolean }>;
  myHandle: string | null;
}) {
  const status = statusMap[issue.status];
  const timeLeft = status?.isActive ? formatTimeLeft(issue.dueBy) : null;
  const needsAttention = status?.isActive && issue.assignedTo === myHandle;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 border-b hover:bg-accent transition-colors ${selected ? 'bg-accent' : ''}`}
    >
      <div className="flex items-start gap-2">
        {(() => {
          const Icon = PRIORITY_ICONS[issue.priority];
          if (!Icon) return null;
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Icon className={`size-3.5 mt-0.5 shrink-0 ${PRIORITY_COLORS[issue.priority] ?? ''}`} />
                </TooltipTrigger>
                <TooltipContent>{issue.priority} priority</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })()}
        {needsAttention && (
          <span className="size-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs text-muted-foreground font-mono shrink-0">{issue.code}</span>
            {status && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full text-white shrink-0"
                style={{ backgroundColor: status.bgColor }}
              >
                {status.name}
              </span>
            )}
          </div>
          <p className="text-sm leading-tight line-clamp-2">{issue.title}</p>
          {timeLeft && (
            <p className={`text-xs mt-1 ${timeLeft.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              {timeLeft.text}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
