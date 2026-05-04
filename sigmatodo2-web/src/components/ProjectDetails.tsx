import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, UserPlus, Trash2 } from 'lucide-react';
import { projects as projectsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Project, PermissionsMap } from 'sigmatodo2-common';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { InviteDialog } from '@/components/InviteDialog';
import { ProjectSettingsDialog } from '@/components/ProjectSettingsDialog';

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

