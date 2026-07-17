import { useEffect, useState, useRef } from 'react';
import type { ElementType } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronsUp,
  Code2,
  Copy,
  File as FileIcon,
  FileText,
  Image,
  Music,
  Paperclip,
  Pencil,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { issues as issuesApi, attachments as attachmentsApi, comments as commentsApi, projects as projectsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fileUrl } from '@/lib/files';
import { formatIssueForLlmXml } from '@/lib/issueLlmExport';
import { formatTimeLeft } from '@/lib/time';
import type { Attachment, Project, Comment, IssueWithAssignee } from 'sigmatodo2-common';
import MarkdownEditor from '@/components/MarkdownEditor';
import MarkdownViewer from '@/components/MarkdownViewer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/datepicker';
import { TimePicker } from '@/components/ui/timepicker';
import { Switch } from '@/components/ui/switch';
import type { PermissionsMap } from 'sigmatodo2-common';

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

interface IssueDetailsProps {
  issueCode: string;
  project?: (Project & { myPermissions?: PermissionsMap }) | null;
  onClose: () => void;
}

export default function IssueDetails({ issueCode, project, onClose }: IssueDetailsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = project?.myPermissions?.editIssues ?? false;
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: issue, isLoading } = useQuery({
    queryKey: ['issue', issueCode],
    queryFn: () => issuesApi.get(issueCode),
  });

  const { data: attachmentList = [], isLoading: isLoadingAttachments } = useQuery({
    queryKey: ['attachments', issueCode],
    queryFn: () => attachmentsApi.list(issueCode),
    enabled: !!issue,
  });

  const { data: commentList = [], isLoading: isLoadingComments } = useQuery({
    queryKey: ['comments', issueCode],
    queryFn: () => commentsApi.list(issueCode),
    enabled: !!issue,
  });

  const { data: memberList = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['members', project?.code],
    queryFn: () => projectsApi.getMembers(project!.code),
    enabled: !!project,
  });

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
  }, []);

  const updateCachedCommentCount = (delta: number, projectCode = issue?.projectCode) => {
    const updateCount = (old: IssueWithAssignee | undefined) =>
      old ? { ...old, commentCount: Math.max(0, old.commentCount + delta) } : old;

    qc.setQueryData<IssueWithAssignee>(['issue', issueCode], updateCount);
    if (projectCode) {
      qc.setQueriesData<IssueWithAssignee[]>(
        { queryKey: ['issues', projectCode] },
        (old) => old?.map(i => (i.code === issueCode ? updateCount(i) as IssueWithAssignee : i)),
      );
    }
    qc.setQueriesData<IssueWithAssignee[]>(
      { queryKey: ['userIssues'] },
      (old) => old?.map(i => (i.code === issueCode ? updateCount(i) as IssueWithAssignee : i)),
    );
  };

  const addAttachmentToCache = (attachment: Attachment) => {
    qc.setQueryData<Attachment[]>(['attachments', issueCode], (old = []) => {
      if (old.some(a => a.id === attachment.id)) return old;
      return [attachment, ...old];
    });
  };

  const handleAttachmentUploaded = (attachment: Attachment) => {
    addAttachmentToCache(attachment);
    qc.invalidateQueries({ queryKey: ['attachments', issueCode] });
  };

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
      const optimisticData = data.markdownDescription !== undefined
        ? { ...data, renderedMarkdownDescription: undefined }
        : data;

      qc.setQueryData(['issue', issueCode], (old: typeof issue) =>
        old ? { ...old, ...optimisticData } : old,
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

  const createComment = useMutation({
    mutationFn: (content: string) => commentsApi.create(issueCode, content),

    onMutate: async (content) => {
      const projectCode = issue?.projectCode;
      const tempId = `pending-${Date.now()}`;

      await qc.cancelQueries({ queryKey: ['comments', issueCode] });
      await qc.cancelQueries({ queryKey: ['issue', issueCode] });
      if (projectCode) await qc.cancelQueries({ queryKey: ['issues', projectCode] });
      await qc.cancelQueries({ queryKey: ['userIssues'] });

      const prevComments = qc.getQueryData<Comment[]>(['comments', issueCode]);
      const prevDetail = qc.getQueryData<IssueWithAssignee>(['issue', issueCode]);
      const prevLists = projectCode
        ? qc.getQueriesData<IssueWithAssignee[]>({ queryKey: ['issues', projectCode] })
        : [];
      const prevUserIssueLists = qc.getQueriesData<IssueWithAssignee[]>({ queryKey: ['userIssues'] });

      const optimisticComment: Comment = {
        id: tempId,
        issueCode,
        postedBy: user?.handle ?? '',
        postedOn: new Date().toISOString(),
        editedOn: null,
        content,
        author: user ?? undefined,
      };

      qc.setQueryData<Comment[]>(['comments', issueCode], (old = []) => [...old, optimisticComment]);
      updateCachedCommentCount(1, projectCode);

      return { tempId, prevComments, prevDetail, prevLists, prevUserIssueLists, projectCode };
    },

    onError: (_err, _content, ctx) => {
      qc.setQueryData(['comments', issueCode], ctx?.prevComments);
      if (ctx?.prevDetail) qc.setQueryData(['issue', issueCode], ctx.prevDetail);
      ctx?.prevLists.forEach(([key, val]) => qc.setQueryData(key, val));
      ctx?.prevUserIssueLists.forEach(([key, val]) => qc.setQueryData(key, val));
    },

    onSuccess: (comment, _content, ctx) => {
      qc.setQueryData<Comment[]>(['comments', issueCode], (old) =>
        old?.map(c => (c.id === ctx?.tempId ? comment : c)),
      );
    },

    onSettled: (_data, _err, _content, ctx) => {
      qc.invalidateQueries({ queryKey: ['comments', issueCode] });
      qc.invalidateQueries({ queryKey: ['issue', issueCode] });
      if (ctx?.projectCode) qc.invalidateQueries({ queryKey: ['issues', ctx.projectCode] });
      qc.invalidateQueries({ queryKey: ['userIssues'] });
    },
  });

  const saveDesc = () => {
    update.mutate({ markdownDescription: descDraft });
    setEditingDesc(false);
  };

  const uploadFile = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload(issueCode, file),
    onSuccess: handleAttachmentUploaded,
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => attachmentsApi.delete(id),
    onSuccess: (_data, id) => {
      qc.setQueryData<Attachment[]>(['attachments', issueCode], old => old?.filter(a => a.id !== id));
      qc.invalidateQueries({ queryKey: ['attachments', issueCode] });
    },
  });

  if (isLoading || !issue) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>;
  }

  const statusDefs = project?.statusDefinitions ?? [];
  const statusMap = Object.fromEntries(statusDefs.map(s => [s.code, s]));
  const currentStatus = statusMap[issue.status];
  const timeLeft = formatTimeLeft(issue.dueBy);
  const isPreparingLlmCopy = isLoadingAttachments || isLoadingComments || (!!project && isLoadingMembers);
  const CopyForLlmsIcon = copyState === 'copied' ? Check : copyState === 'failed' ? X : Copy;
  const copyForLlmsLabel = isPreparingLlmCopy
    ? 'Preparing...'
    : copyState === 'copied'
      ? 'Copied'
      : copyState === 'failed'
        ? 'Copy failed'
        : 'Copy for LLMs';
  const setTemporaryCopyState = (state: 'copied' | 'failed') => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    setCopyState(state);
    copyResetRef.current = setTimeout(() => setCopyState('idle'), 2000);
  };
  const copyForLlms = async () => {
    if (isPreparingLlmCopy) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable');
      }

      const xml = formatIssueForLlmXml({
        issue,
        project,
        attachments: attachmentList,
        comments: commentList,
        members: memberList,
        getAttachmentUrl: attachment => attachmentsApi.getUrl(attachment.id),
      });
      await navigator.clipboard.writeText(xml);
      setTemporaryCopyState('copied');
    } catch {
      setTemporaryCopyState('failed');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Title section */}
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
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs whitespace-nowrap"
            onClick={copyForLlms}
            disabled={isPreparingLlmCopy}
            aria-label="Copy issue details for LLMs"
          >
            <CopyForLlmsIcon className="size-3.5 mr-1" />
            {copyForLlmsLabel}
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
      {/* Header section — items use explicit row/col placement at ≥600px so that
           labels share a row and values share a row across both columns.
           DOM order (left fields first, then right fields) gives a clean single-column layout. */}
      <div className="grid grid-cols-1 min-[600px]:grid-cols-2 gap-x-6 p-5 border-b text-sm items-start">

        {/* ── Left column ─────────────────────────────────────────── */}

        {/* Status label */}
        <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5
                       min-[600px]:row-start-1">
          Status
        </p>
        {/* Status value */}
        <div className="pb-3 min-[600px]:row-start-2">
          {canEdit ? (
            <div className="flex flex-wrap gap-1.5">
              {statusDefs.map(s => (
                <button
                  key={s.code}
                  onClick={() => update.mutate({ status: s.code })}
                  className="text-xs px-2 py-0.5 rounded-full text-white transition-all"
                  style={{
                    backgroundColor: s.bgColor,
                    opacity: s.code === issue.status ? 1 : 0.5,
                    filter: s.code === issue.status ? 'none' : 'saturate(0.5)',
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ) : currentStatus ? (
            <span
              className="inline-block text-xs px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: currentStatus.bgColor }}
            >
              {currentStatus.name}
            </span>
          ) : null}
        </div>

        {/* Priority label */}
        <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5
                       min-[600px]:row-start-3">
          Priority
        </p>
        {/* Priority value */}
        <div className="pb-3 min-[600px]:row-start-4">
          {canEdit ? (
            <Select value={issue.priority} onValueChange={priority => update.mutate({ priority })}>
              <SelectTrigger className="h-8 text-xs capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['low', 'normal', 'high', 'highest'] as const).map(p => {
                  const Icon = PRIORITY_ICONS[p];
                  return (
                    <SelectItem key={p} value={p}>
                      <div className="flex items-center gap-1.5 capitalize">
                        {Icon && <Icon className={`size-3.5 ${PRIORITY_COLORS[p] ?? ''}`} />}
                        {p}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-1.5">
              {(() => {
                const Icon = PRIORITY_ICONS[issue.priority];
                return Icon ? <Icon className={`size-3.5 ${PRIORITY_COLORS[issue.priority] ?? ''}`} /> : null;
              })()}
              <span className="text-xs capitalize">{issue.priority}</span>
            </div>
          )}
        </div>

        {/* Assignee label + "assign to me" */}
        <div className="flex items-center justify-between mb-0.5 min-[600px]:row-start-5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Assignee</p>
          {canEdit && user && issue.assignedTo !== user.handle && (
            <button
              onClick={() => update.mutate({ assignedTo: user.handle })}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              assign to me
            </button>
          )}
        </div>
        {/* Assignee value */}
        <div className="pb-3 min-[600px]:row-start-6">
          {canEdit ? (
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
                        <AvatarImage src={fileUrl(m.user?.avatarPath)} />
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
          ) : issue.assignedTo ? (
            <div className="flex items-center gap-1.5">
              <Avatar className="size-5 shrink-0">
                <AvatarImage src={fileUrl(issue.assignee?.avatarPath)} />
                <AvatarFallback className="text-[9px]">
                  {(issue.assignee?.displayName ?? issue.assignedTo).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs">{issue.assignee?.displayName ?? issue.assignedTo}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>

        {/* Due date (component spans its own rows, no right-column counterpart) */}
        <div className="pb-3 min-[600px]:row-start-7">
          <DueDatePicker dueBy={issue.dueBy} onSet={iso => update.mutate({ dueBy: iso })} canEdit={canEdit} />
        </div>

        {/* ── Right column (explicitly placed at ≥600px) ──────────── */}

        {/* Created by label */}
        <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5
                       min-[600px]:col-start-2 min-[600px]:row-start-1">
          Created by
        </p>
        {/* Created by value */}
        <div className="pb-3 min-[600px]:col-start-2 min-[600px]:row-start-2">
          <div className="flex items-center gap-1.5">
            <Avatar className="size-4 shrink-0">
              <AvatarImage src={fileUrl(issue.creator?.avatarPath)} />
              <AvatarFallback className="text-[9px]">
                {(issue.creator?.displayName ?? issue.createdBy ?? '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <p className="text-xs">{issue.creator?.displayName ?? issue.createdBy ?? '—'}</p>
          </div>
        </div>

        {/* Created label */}
        <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5
                       min-[600px]:col-start-2 min-[600px]:row-start-3">
          Created
        </p>
        {/* Created value — self-center so it aligns with the priority dropdown */}
        <p className="text-xs pb-3 self-center min-[600px]:col-start-2 min-[600px]:row-start-4">
          {new Date(issue.createdOn).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}
        </p>

        {/* Updated label */}
        <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5
                       min-[600px]:col-start-2 min-[600px]:row-start-5">
          Updated
        </p>
        {/* Updated value — self-center so it aligns with the assignee dropdown */}
        <p className="text-xs self-center min-[600px]:col-start-2 min-[600px]:row-start-6">
          {new Date(issue.updatedOn).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}
        </p>

      </div>

      {/* Details section */}
        <div className="p-5 flex flex-col gap-6">
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
                <MarkdownEditor
                  value={descDraft}
                  onChange={setDescDraft}
                  issueCode={issueCode}
                  onAttachmentUploaded={handleAttachmentUploaded}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveDesc}><Check className="size-3 mr-1" /> Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingDesc(false)}>Cancel</Button>
                </div>
              </div>
            ) : issue.markdownDescription ? (
              <MarkdownViewer content={issue.renderedMarkdownDescription ?? issue.markdownDescription} />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {attachmentList.map(a => (
                  <AttachmentCard
                    key={a.id}
                    attachment={a}
                    canEdit={canEdit}
                    onDelete={() => deleteAttachment.mutate(a.id)}
                  />
                ))}
              </div>
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
                issueCode={issueCode}
                onAttachmentUploaded={handleAttachmentUploaded}
                onUpdate={(content) => {
                  commentsApi.update(c.id, content).then(() => qc.invalidateQueries({ queryKey: ['comments', issueCode] }));
                }}
                onDelete={() => {
                  commentsApi.delete(c.id).then(() => {
                    qc.setQueryData<Comment[]>(['comments', issueCode], old => old?.filter(comment => comment.id !== c.id));
                    updateCachedCommentCount(-1);
                    qc.invalidateQueries({ queryKey: ['comments', issueCode] });
                    qc.invalidateQueries({ queryKey: ['issue', issueCode] });
                    qc.invalidateQueries({ queryKey: ['issues', issue.projectCode] });
                    qc.invalidateQueries({ queryKey: ['userIssues'] });
                  });
                }}
              />
            ))}
            <NewCommentBox
              issueCode={issueCode}
              onAttachmentUploaded={handleAttachmentUploaded}
              onSubmit={content => createComment.mutate(content)}
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function getAttachmentIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (
    mimeType.includes('zip') ||
    mimeType.includes('tar') ||
    mimeType.includes('gzip') ||
    mimeType.includes('rar') ||
    mimeType.includes('7z')
  ) return Archive;
  if (
    mimeType.startsWith('text/') ||
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('presentation') ||
    mimeType.includes('spreadsheet')
  ) return FileText;
  if (
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('javascript') ||
    mimeType.includes('typescript')
  ) return Code2;
  return FileIcon;
}

function formatMimeType(mimeType: string): string {
  if (!mimeType) return 'File';
  const [type, subtype] = mimeType.split('/');
  if (!subtype) return mimeType;
  return `${type} / ${subtype.replace(/[.+-]/g, ' ')}`;
}

function AttachmentCard({
  attachment,
  canEdit,
  onDelete,
}: {
  attachment: Attachment;
  canEdit: boolean;
  onDelete: () => void;
}) {
  const href = attachmentsApi.getBrowserUrl(attachment.id);
  const isImage = attachment.mimeType.startsWith('image/');
  const Icon = getAttachmentIcon(attachment.mimeType);

  return (
    <div className="group rounded-md border bg-card shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
          {isImage ? (
            <img
              src={href}
              alt={attachment.filename}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Icon className="size-10" />
              <span className="text-[11px] uppercase">{attachment.mimeType.split('/')[0] ?? 'file'}</span>
            </div>
          )}
        </div>
      </a>
      <div className="p-3">
        <div className="flex items-start gap-2">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
            title={attachment.filename}
          >
            {attachment.filename}
          </a>
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              aria-label={`Delete ${attachment.filename}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{formatMimeType(attachment.mimeType)}</span>
          <span className="shrink-0">{new Date(attachment.uploadedOn).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

function CommentItem({
  comment, canEdit, issueCode, onAttachmentUploaded, onUpdate, onDelete,
}: {
  comment: Comment;
  canEdit: boolean;
  issueCode: string;
  onAttachmentUploaded: (attachment: Attachment) => void;
  onUpdate: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);

  return (
    <div className="flex gap-3">
      <Avatar className="size-7 shrink-0 mt-0.5">
        <AvatarImage src={fileUrl(comment.author?.avatarPath)} />
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
            <MarkdownEditor
              value={draft}
              onChange={setDraft}
              issueCode={issueCode}
              onAttachmentUploaded={onAttachmentUploaded}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onUpdate(draft); setEditing(false); }}><Check className="size-3 mr-1" /> Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <MarkdownViewer content={comment.renderedContent ?? comment.content} className="text-sm" />
        )}
      </div>
    </div>
  );
}

function NewCommentBox({
  issueCode,
  onAttachmentUploaded,
  onSubmit,
}: {
  issueCode: string;
  onAttachmentUploaded: (attachment: Attachment) => void;
  onSubmit: (content: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (value.trim()) { onSubmit(value); setValue(''); } }}
      className="flex flex-col gap-2"
    >
      <MarkdownEditor
        value={value}
        onChange={setValue}
        issueCode={issueCode}
        onAttachmentUploaded={onAttachmentUploaded}
      />
      <Button type="submit" size="sm" disabled={!value.trim()} className="self-end">Comment</Button>
    </form>
  );
}

function DueDatePicker({ dueBy, onSet, canEdit }: { dueBy: string | null; onSet: (iso: string | null) => void; canEdit: boolean }) {
  const selected = dueBy ? new Date(dueBy) : undefined;
  const timeValue = dueBy
    ? `${String(new Date(dueBy).getHours()).padStart(2, '0')}:${String(new Date(dueBy).getMinutes()).padStart(2, '0')}`
    : '23:59';

  const setDate = (d: Date | undefined) => {
    if (!d) return;
    if (dueBy) {
      const prev = new Date(dueBy);
      d.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    } else {
      d.setHours(23, 59, 0, 0);
    }
    onSet(d.toISOString());
  };

  const setTime = (timeStr: string) => {
    if (!dueBy) return;
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dueBy);
    d.setHours(h, m, 0, 0);
    onSet(d.toISOString());
  };

  if (!canEdit) {
    return (
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-muted-foreground uppercase">Due date</p>
        {dueBy ? (
          <p className="text-xs">{new Date(dueBy).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Not set</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 @container">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <Switch
          size="sm"
          checked={!!dueBy}
          onCheckedChange={checked => onSet(checked ? (() => { const d = new Date(); d.setHours(23, 59, 0, 0); return d.toISOString(); })() : null)}
        />
        <p className="text-xs font-medium text-muted-foreground uppercase">Due date</p>
      </label>
      {!dueBy && (
        <p className="text-xs text-muted-foreground">Due date not set.</p>
      )}
      {dueBy && (
        <>
          <div className="flex flex-col @[280px]:flex-row gap-2">
            <div className="flex-1">
              <DatePicker value={selected} onChange={setDate} className="h-8 text-xs" />
            </div>
            <div className="@[280px]:w-28">
              <TimePicker value={timeValue} onChange={setTime} step={5} className="h-8" />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {[
              { label: 'by 23:59 today', getDate: () => { const d = new Date(); d.setHours(23, 59, 0, 0); return d; } },
              { label: 'in 3 days',      getDate: () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(23, 59, 0, 0); return d; } },
              { label: 'in a week',      getDate: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); return d; } },
            ].map(({ label, getDate }) => (
              <button
                key={label}
                type="button"
                onClick={() => onSet(getDate().toISOString())}
                className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
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
