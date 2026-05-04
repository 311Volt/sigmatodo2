import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, UserPlus, Trash2, Copy, Check, Link, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { projects as projectsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Project, PermissionsMap, StatusDefinition, Invitation } from 'sigmatodo2-common';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface ProjectDetailsProps {
  project?: (Project & { myPermissions?: PermissionsMap }) | null;
  projectCode: string;
}

export default function ProjectDetails({ project, projectCode }: ProjectDetailsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canManage = project?.myPermissions?.changeProjectSettings ?? false;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['members', projectCode],
    queryFn: () => projectsApi.getMembers(projectCode),
  });

  const removeMember = useMutation({
    mutationFn: (handle: string) => projectsApi.removeMember(projectCode, handle),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', projectCode] }),
  });

  if (!project) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        {project.backgroundImgPath && (
          <img
            src={project.backgroundImgPath}
            alt="Project background"
            className="w-24 h-16 object-cover rounded-lg shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{project.name}</h2>
            <span className="text-sm font-mono text-muted-foreground">{project.code}</span>
          </div>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <Settings className="size-4 mr-1" /> Settings
          </Button>
        )}
      </div>

      <Separator />

      {/* Members */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Team</h3>
          {canManage && (
            <Button variant="outline" size="sm" className="h-7" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-3 mr-1" /> Invite
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {members.map(m => (
            <div key={m.userHandle} className="flex items-center gap-3">
              <Avatar className="size-7">
                <AvatarImage src={m.user?.avatarPath ?? undefined} />
                <AvatarFallback className="text-xs">
                  {(m.user?.displayName ?? m.userHandle).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.user?.displayName ?? m.userHandle}</p>
                <p className="text-xs text-muted-foreground">@{m.userHandle}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {m.permissions.changeProjectSettings ? 'owner' : m.permissions.editIssues ? 'editor' : 'viewer'}
              </span>
              {canManage && m.userHandle !== user?.handle && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-destructive"
                  onClick={() => removeMember.mutate(m.userHandle)}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Invite dialog */}
      {canManage && user && (
        <InviteDialog
          projectCode={projectCode}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          myHandle={user.handle}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['members', projectCode] })}
        />
      )}

      {/* Settings dialog */}
      {canManage && (
        <ProjectSettingsDialog
          project={project}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSave={() => qc.invalidateQueries({ queryKey: ['project', projectCode] })}
        />
      )}
    </div>
  );
}

function InviteDialog({
  projectCode, open, onOpenChange, myHandle, onSuccess,
}: {
  projectCode: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  myHandle: string;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: existingInvitations, isLoading } = useQuery({
    queryKey: ['invitations', projectCode],
    queryFn: () => projectsApi.getInvitations(projectCode),
    enabled: open,
  });

  // Pre-populate from existing active invitation from me
  useEffect(() => {
    if (!existingInvitations || invitation) return;
    const active = existingInvitations.find(inv =>
      inv.invitedBy === myHandle &&
      !inv.acceptedOn &&
      inv.invitationFor === null &&
      (!inv.expiresAt || new Date(inv.expiresAt) > new Date()),
    );
    if (active) {
      setInvitation(active);
      setExpiresAt(active.expiresAt ? new Date(active.expiresAt) : undefined);
    }
  }, [existingInvitations, myHandle, invitation]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setInvitation(null);
      setExpiresAt(undefined);
      setCopied(false);
    }
  }, [open]);

  const generate = useMutation({
    mutationFn: () => projectsApi.invite(projectCode, role, expiresAt?.toISOString()),
    onSuccess: (inv) => {
      setInvitation(inv);
      onSuccess();
    },
  });

  const inviteLink = invitation
    ? `${window.location.origin}/invite/${invitation.invitationCode}`
    : '';

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite to Project</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Loading…
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={v => { setRole(v as 'editor' | 'viewer'); setInvitation(null); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor (can edit issues)</SelectItem>
                      <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label>Expires</Label>
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-sm">
                        <CalendarIcon className="size-3.5 mr-2 shrink-0" />
                        {expiresAt ? format(expiresAt, 'MMM d, yyyy') : <span className="text-muted-foreground">Never</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="p-2 border-b">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => { setExpiresAt(undefined); setCalOpen(false); setInvitation(null); }}
                        >
                          No expiration
                        </Button>
                      </div>
                      <Calendar
                        mode="single"
                        selected={expiresAt}
                        onSelect={d => { setExpiresAt(d); setCalOpen(false); setInvitation(null); }}
                        disabled={d => d < new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {invitation ? (
                <div className="space-y-2">
                  <Label>Invitation Link</Label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono truncate text-muted-foreground">
                      <Link className="size-3 shrink-0" />
                      <span className="truncate">{inviteLink}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={copyLink} className="shrink-0">
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </Button>
                  </div>
                  {expiresAt && (
                    <p className="text-xs text-muted-foreground">
                      Expires {format(expiresAt, 'MMMM d, yyyy')}
                    </p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!isLoading && (
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? 'Generating…' : invitation ? 'Regenerate Link' : 'Generate Link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectSettingsDialog({
  project, open, onOpenChange, onSave,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
  });
  const [statusDefs, setStatusDefs] = useState<StatusDefinition[]>(project.statusDefinitions);
  const [error, setError] = useState('');

  const update = useMutation({
    mutationFn: () => projectsApi.update(project.code, {
      name: form.name,
      description: form.description || null,
      statusDefinitions: statusDefs,
    }),
    onSuccess: () => {
      onSave();
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const addStatus = () => {
    setStatusDefs(s => [...s, { code: `STATUS${s.length + 1}`, name: 'New Status', bgColor: '#6b7280', importanceLevel: 1, isActive: false }]);
  };

  const removeStatus = (code: string) => {
    if (code === 'TODO' || code === 'DONE') return;
    setStatusDefs(s => s.filter(d => d.code !== code));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Project Settings</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); update.mutate(); }} className="flex flex-col gap-4">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Statuses</Label>
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={addStatus}>Add</Button>
            </div>
            {statusDefs.map((s, i) => (
              <div key={s.code} className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.bgColor}
                  onChange={e => setStatusDefs(ds => ds.map((d, j) => j === i ? { ...d, bgColor: e.target.value } : d))}
                  className="w-8 h-8 rounded border cursor-pointer p-0.5"
                />
                <Input
                  value={s.name}
                  onChange={e => setStatusDefs(ds => ds.map((d, j) => j === i ? { ...d, name: e.target.value } : d))}
                  className="flex-1 h-8 text-xs"
                />
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={s.importanceLevel}
                  onChange={e => setStatusDefs(ds => ds.map((d, j) => j === i ? { ...d, importanceLevel: parseInt(e.target.value) } : d))}
                  className="w-14 h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                  title="Importance level"
                />
                <input
                  type="checkbox"
                  checked={s.isActive}
                  onChange={e => setStatusDefs(ds => ds.map((d, j) => j === i ? { ...d, isActive: e.target.checked } : d))}
                  className="size-4 shrink-0 cursor-pointer"
                  title="Active status (counts toward open issues and shows deadlines)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-destructive"
                  onClick={() => removeStatus(s.code)}
                  disabled={s.code === 'TODO' || s.code === 'DONE'}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Number = importance level (higher = more active in "Relevant" sort) · Checkbox = active (counts toward open issues, shows deadlines)</p>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
