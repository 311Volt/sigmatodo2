import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Paperclip, Trash2, Pencil, Check, CalendarIcon } from 'lucide-react';
import { issues as issuesApi, attachments as attachmentsApi, comments as commentsApi, projects as projectsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatTimeLeft } from '@/lib/time';
import type { Project, Comment, IssueWithAssignee } from 'sigmatodo2-common';
import MarkdownEditor from '@/components/MarkdownEditor';
import MarkdownViewer from '@/components/MarkdownViewer';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PermissionsMap } from 'sigmatodo2-common';

interface IssueDetailsProps {
  issueCode: string;
  project?: (Project & { myPermissions?: PermissionsMap }) | null;
  onClose: () => void;
}

export default function IssueDetails({ issueCode, project, onClose }: IssueDetailsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = project?.myPermissions?.editIssues ?? false;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', issueCode],
    queryFn: () => issuesApi.get(issueCode),
  });

  const { data: attachmentList = [] } = useQuery({
    queryKey: ['attachments', issueCode],
    queryFn: () => attachmentsApi.list(issueCode),
    enabled: !!issue,
  });

  const { data: commentList = [] } = useQuery({
    queryKey: ['comments', issueCode],
    queryFn: () => commentsApi.list(issueCode),
    enabled: !!issue,
  });

  const { data: memberList = [] } = useQuery({
    queryKey: ['members', project?.code],
    queryFn: () => projectsApi.getMembers(project!.code),
    enabled: !!project,
  });

  const update = useMutation({
    mutationFn: (data: Parameters<typeof issuesApi.update>[1]) => issuesApi.update(issueCode, data),

    onMutate: async (data) => {
      const projectCode = issue?.projectCode;
      await qc.cancelQueries({ queryKey: ['issue', issueCode] });
      if (projectCode) await qc.cancelQueries({ queryKey: ['issues', projectCode] });

      const prevDetail = qc.getQueryData(['issue', issueCode]);
      const prevLists = projectCode
        ? qc.getQueriesData<IssueWithAssignee[]>({ queryKey: ['issues', projectCode] })
        : [];

      qc.setQueryData(['issue', issueCode], (old: typeof issue) =>
        old ? { ...old, ...data } : old,
      );
      if (projectCode) {
        qc.setQueriesData<IssueWithAssignee[]>(
          { queryKey: ['issues', projectCode] },
          (old) => old?.map((i) => (i.code === issueCode ? { ...i, ...data } as IssueWithAssignee : i)),
        );
      }

      return { prevDetail, prevLists, projectCode };
    },

    onError: (_err, _data, ctx) => {
      if (ctx?.prevDetail) qc.setQueryData(['issue', issueCode], ctx.prevDetail);
      ctx?.prevLists?.forEach(([key, val]) => qc.setQueryData(key, val));
    },

    onSettled: (_data, _err, _vars, ctx) => {
      qc.invalidateQueries({ queryKey: ['issue', issueCode] });
      if (ctx?.projectCode)
        qc.invalidateQueries({ queryKey: ['issues', ctx.projectCode] });
    },
  });

  const saveDesc = () => {
    update.mutate({ markdownDescription: descDraft });
    setEditingDesc(false);
  };

  const uploadFile = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(issueCode, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', issueCode] }),
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => attachmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', issueCode] }),
  });

  if (isLoading || !issue) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>;
  }

  const statusDefs = project?.statusDefinitions ?? [];
  const statusMap = Object.fromEntries(statusDefs.map(s => [s.code, s]));
  const currentStatus = statusMap[issue.status];
  const timeLeft = formatTimeLeft(issue.dueBy);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">{issue.code}</span>
            {currentStatus && (
              <span
                className="text-xs px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: currentStatus.bgColor }}
              >
                {currentStatus.name}
              </span>
            )}
            {timeLeft && (
              <span className={`text-xs ${timeLeft.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                {timeLeft.text}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            {editingTitle ? (
              <form
                className="flex items-center gap-2 flex-1"
                onSubmit={e => {
                  e.preventDefault();
                  if (titleDraft.trim()) update.mutate({ title: titleDraft.trim() });
                  setEditingTitle(false);
                }}
              >
                <input
                  autoFocus
                  className="flex-1 min-w-0 text-lg font-semibold rounded-md border border-input bg-transparent px-2 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    if (titleDraft.trim()) update.mutate({ title: titleDraft.trim() });
                    setEditingTitle(false);
                  }}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingTitle(false); }}
                />
              </form>
            ) : (
              <h2 className="text-lg font-semibold leading-snug">{issue.title}</h2>
            )}
            {canEdit && !editingTitle && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs shrink-0"
                onClick={() => { setTitleDraft(issue.title); setEditingTitle(true); }}
              >
                <Pencil className="size-3 mr-1" /> Edit
              </Button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {/* Description */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Description</h3>
              {canEdit && !editingDesc && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setDescDraft(issue.markdownDescription ?? ''); setEditingDesc(true); }}
                >
                  <Pencil className="size-3 mr-1" /> Edit
                </Button>
              )}
            </div>
            {editingDesc ? (
              <div className="flex flex-col gap-2">
                <MarkdownEditor value={descDraft} onChange={setDescDraft} issueCode={issueCode} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveDesc}><Check className="size-3 mr-1" /> Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>Cancel</Button>
                </div>
              </div>
            ) : issue.markdownDescription ? (
              <MarkdownViewer content={issue.markdownDescription} />
            ) : (
              <p className="text-sm text-muted-foreground italic">No description yet.</p>
            )}
          </section>

          {/* Attachments */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Attachments</h3>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="size-3 mr-1" /> Add
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile.mutate(file);
                  e.target.value = '';
                }}
              />
            </div>
            {attachmentList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attachments.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {attachmentList.map(a => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <a
                      href={attachmentsApi.getUrl(a.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex-1 min-w-0 truncate"
                    >
                      {a.filename}
                    </a>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        onClick={() => deleteAttachment.mutate(a.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Comments */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Comments ({commentList.length})</h3>
            {commentList.map(c => (
              <CommentItem
                key={c.id}
                comment={c}
                canEdit={c.postedBy === user?.handle}
                onUpdate={(content) => {
                  commentsApi.update(c.id, content).then(() => qc.invalidateQueries({ queryKey: ['comments', issueCode] }));
                }}
                onDelete={() => {
                  commentsApi.delete(c.id).then(() => {
                    qc.invalidateQueries({ queryKey: ['comments', issueCode] });
                    qc.invalidateQueries({ queryKey: ['issue', issueCode] });
                  });
                }}
              />
            ))}
            <NewCommentBox
              onSubmit={content => {
                commentsApi.create(issueCode, content).then(() => {
                  qc.invalidateQueries({ queryKey: ['comments', issueCode] });
                  qc.invalidateQueries({ queryKey: ['issue', issueCode] });
                });
              }}
            />
          </section>
        </div>

        {/* Sidebar */}
        <aside className="w-48 border-l p-4 flex flex-col gap-4 text-sm shrink-0">
          {canEdit && (
            <>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Status</p>
                <Select
                  value={issue.status}
                  onValueChange={status => update.mutate({ status })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusDefs.map(s => <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Priority</p>
                <Select
                  value={issue.priority}
                  onValueChange={priority => update.mutate({ priority })}
                >
                  <SelectTrigger className="h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['low', 'normal', 'high', 'highest'] as const).map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Assignee</p>
                <Select
                  value={issue.assignedTo ?? '__none__'}
                  onValueChange={v => update.mutate({ assignedTo: v === '__none__' ? null : v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {memberList.map(m => (
                      <SelectItem key={m.userHandle} value={m.userHandle}>
                        <div className="flex items-center gap-1.5">
                          <Avatar className="size-4 shrink-0">
                            <AvatarImage src={m.user?.avatarPath ?? undefined} />
                            <AvatarFallback className="text-[9px]">
                              {(m.user?.displayName ?? m.userHandle).charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {m.user?.displayName ?? m.userHandle}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DueDatePicker
                dueBy={issue.dueBy}
                onSet={iso => update.mutate({ dueBy: iso })}
              />
            </>
          )}
          {!canEdit && issue.assignedTo && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Assignee</p>
              <p className="text-xs">{issue.assignee?.displayName ?? issue.assignedTo}</p>
            </div>
          )}
          <div className="border-t pt-3 flex flex-col gap-2 mt-auto">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase">Created by</p>
              <div className="flex items-center gap-1.5">
                <Avatar className="size-4 shrink-0">
                  <AvatarImage src={issue.creator?.avatarPath ?? undefined} />
                  <AvatarFallback className="text-[9px]">
                    {(issue.creator?.displayName ?? issue.createdBy ?? '?').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs">{issue.creator?.displayName ?? issue.createdBy ?? '—'}</p>
              </div>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase">Created</p>
              <p className="text-xs">{new Date(issue.createdOn).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground uppercase">Updated</p>
              <p className="text-xs">{new Date(issue.updatedOn).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CommentItem({
  comment, canEdit, onUpdate, onDelete,
}: {
  comment: Comment;
  canEdit: boolean;
  onUpdate: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);

  return (
    <div className="flex gap-3">
      <Avatar className="size-7 shrink-0 mt-0.5">
        <AvatarImage src={comment.author?.avatarPath ?? undefined} />
        <AvatarFallback className="text-xs">
          {(comment.author?.displayName ?? comment.postedBy).charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{comment.author?.displayName ?? comment.postedBy}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(comment.postedOn).toLocaleDateString()}
            {comment.editedOn && ' (edited)'}
          </span>
          {canEdit && !editing && (
            <>
              <button
                onClick={() => { setDraft(comment.content); setEditing(true); }}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3" />
              </button>
              <button onClick={onDelete} className="text-xs text-destructive hover:text-destructive/80">
                <Trash2 className="size-3" />
              </button>
            </>
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onUpdate(draft); setEditing(false); }}><Check className="size-3 mr-1" /> Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <MarkdownViewer content={comment.content} className="text-sm" />
        )}
      </div>
    </div>
  );
}

function NewCommentBox({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (value.trim()) { onSubmit(value); setValue(''); } }}
      className="flex flex-col gap-2"
    >
      <textarea
        className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="Add a comment…"
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={!value.trim()} className="self-end">Comment</Button>
    </form>
  );
}

function DueDatePicker({ dueBy, onSet }: { dueBy: string | null; onSet: (iso: string | null) => void }) {
  const [calOpen, setCalOpen] = useState(false);
  const selected = dueBy ? new Date(dueBy) : undefined;

  const setDate = (d: Date | undefined) => {
    if (!d) return;
    d.setHours(23, 59, 0, 0);
    onSet(d.toISOString());
    setCalOpen(false);
  };

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox"
          checked={!!dueBy}
          onChange={e => onSet(e.target.checked ? (() => { const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); })() : null)}
          className="size-3"
        />
        <p className="text-xs font-medium text-muted-foreground uppercase">Due date</p>
      </label>
      {dueBy && (
        <>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-8 text-xs">
                <CalendarIcon className="size-3 mr-2 shrink-0" />
                {format(new Date(dueBy), 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={selected} onSelect={setDate} />
            </PopoverContent>
          </Popover>
          <div className="flex flex-col gap-1 pt-0.5">
            {[
              { label: 'by 23:59 today', getDate: () => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; } },
              { label: 'in 3 days',      getDate: () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(23, 59, 0, 0); return d; } },
              { label: 'in a week',      getDate: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); return d; } },
            ].map(({ label, getDate }) => (
              <button
                key={label}
                type="button"
                onClick={() => onSet(getDate().toISOString())}
                className="text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
