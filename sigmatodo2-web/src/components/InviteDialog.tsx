import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Link } from 'lucide-react';
import { format } from 'date-fns';
import { projects as projectsApi } from '@/lib/api';
import type { Invitation } from 'sigmatodo2-common';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/datepicker';
import { TimePicker } from '@/components/ui/timepicker';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface InviteDialogProps {
  projectCode: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  myHandle: string;
  onSuccess: () => void;
}

export function InviteDialog({
  projectCode, open, onOpenChange, myHandle, onSuccess,
}: InviteDialogProps) {
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [singleUse, setSingleUse] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(undefined);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);
  const hasPopulated = useRef(false);

  const { data: existingInvitations, isLoading } = useQuery({
    queryKey: ['invitations', projectCode],
    queryFn: () => projectsApi.getInvitations(projectCode),
    enabled: open,
  });

  // Pre-populate from existing active invitation from me (once per open)
  useEffect(() => {
    if (!existingInvitations || hasPopulated.current) return;
    hasPopulated.current = true;
    const active = existingInvitations.find(inv =>
      inv.invitedBy === myHandle &&
      !inv.acceptedOn &&
      inv.invitationFor === null &&
      (!inv.expiresAt || new Date(inv.expiresAt) > new Date()),
    );
    if (active) {
      setInvitation(active);
      setExpiresAt(active.expiresAt ? new Date(active.expiresAt) : undefined);
      setSingleUse(active.singleUse);
    }
  }, [existingInvitations, myHandle]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setInvitation(null);
      setExpiresAt(undefined);
      setSingleUse(false);
      setCopied(false);
      hasPopulated.current = false;
    }
  }, [open]);

  const generate = useMutation({
    mutationFn: () => projectsApi.invite(projectCode, role, expiresAt?.toISOString(), singleUse),
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
                  <DatePicker
                    value={expiresAt}
                    onChange={d => {
                      if (d) {
                        d.setHours(expiresAt ? expiresAt.getHours() : 23, expiresAt ? expiresAt.getMinutes() : 59, 0, 0);
                      }
                      setExpiresAt(d);
                      setInvitation(null);
                    }}
                    placeholder="Never"
                    disabled={d => d < new Date()}
                    clearLabel="No expiration"
                    className="h-9 text-sm"
                  />
                  {expiresAt && (
                    <TimePicker
                      value={`${String(expiresAt.getHours()).padStart(2, '0')}:${String(expiresAt.getMinutes()).padStart(2, '0')}`}
                      onChange={timeStr => {
                        const [h, m] = timeStr.split(':').map(Number);
                        const d = new Date(expiresAt);
                        d.setHours(h, m, 0, 0);
                        setExpiresAt(d);
                        setInvitation(null);
                      }}
                      className="h-9 text-sm"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  id="single-use"
                  checked={singleUse}
                  onCheckedChange={v => { setSingleUse(v); setInvitation(null); }}
                />
                <Label htmlFor="single-use" className="cursor-pointer select-none">
                  Single-use (link expires after first accept)
                </Label>
              </div>

              {invitation ? (
                <div className="space-y-2">
                  <Label>Invitation Link</Label>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 flex gap-2 rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
                      <Link className="size-3 shrink-0 mt-0.5" />
                      <span className="break-all select-all">{inviteLink}</span>
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
