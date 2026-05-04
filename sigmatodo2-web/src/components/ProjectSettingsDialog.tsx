import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2, GripVertical } from 'lucide-react';
import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { projects as projectsApi } from '@/lib/api';
import type { Project, StatusDefinition } from 'sigmatodo2-common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface StatusRowProps {
  status: StatusDefinition;
  locked: boolean;
  onChange: (patch: Partial<StatusDefinition>) => void;
  onRemove: () => void;
}

function StatusRow({ status, locked, onChange, onRemove }: StatusRowProps) {
  const { ref: draggableRef, handleRef, isDragging } = useDraggable({ id: status.code });
  const { ref: droppableRef } = useDroppable({ id: status.code });

  const ref = (el: Element | null) => {
    draggableRef(el);
    droppableRef(el);
  };

  return (
    <div
      ref={ref}
      className="flex items-center gap-2"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <button
        ref={handleRef as (el: Element | null) => void}
        type="button"
        className="cursor-grab text-muted-foreground hover:text-foreground shrink-0"
        tabIndex={-1}
      >
        <GripVertical className="size-4" />
      </button>
      <input
        type="color"
        value={status.bgColor}
        onChange={e => onChange({ bgColor: e.target.value })}
        className="w-8 h-8 rounded border cursor-pointer p-0.5 shrink-0"
      />
      <Input
        value={status.name}
        onChange={e => onChange({ name: e.target.value })}
        className="flex-1 h-8 text-xs"
      />
      <Checkbox
        checked={status.isActive}
        onCheckedChange={checked => onChange({ isActive: checked === true })}
        title="Active status (counts toward open issues and shows deadlines)"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-destructive"
        onClick={onRemove}
        disabled={locked}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}

interface Props {
  project: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: () => void;
}

export function ProjectSettingsDialog({ project, open, onOpenChange, onSave }: Props) {
  const [form, setForm] = useState({ name: project.name, description: project.description ?? '' });
  const [statusDefs, setStatusDefs] = useState<StatusDefinition[]>(
    [...project.statusDefinitions].sort((a, b) => b.importanceLevel - a.importanceLevel)
  );
  const [error, setError] = useState('');

  const update = useMutation({
    mutationFn: () => projectsApi.update(project.code, {
      name: form.name,
      description: form.description || null,
      statusDefinitions: statusDefs.map((s, i) => ({ ...s, importanceLevel: statusDefs.length - i })),
    }),
    onSuccess: () => { onSave(); onOpenChange(false); },
    onError: (err: Error) => setError(err.message),
  });

  const addStatus = () => {
    setStatusDefs(s => [{ code: `STATUS${Date.now()}`, name: 'New Status', bgColor: '#6b7280', importanceLevel: 0, isActive: false }, ...s]);
  };

  const handleDragEnd = ({ operation, canceled }: DragEndEvent) => {
    if (canceled || !operation.source || !operation.target) return;
    const fromId = String(operation.source.id);
    const toId = String(operation.target.id);
    if (fromId === toId) return;
    setStatusDefs(defs => {
      const from = defs.findIndex(d => d.code === fromId);
      const to = defs.findIndex(d => d.code === toId);
      if (from === -1 || to === -1) return defs;
      const next = [...defs];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
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
            <p className="text-xs text-muted-foreground">Drag to reorder (top = highest importance) · Checkbox = active (counts toward open issues, shows deadlines)</p>
            <DragDropProvider onDragEnd={handleDragEnd}>
              <div className="flex flex-col gap-2">
                {statusDefs.map(s => (
                  <StatusRow
                    key={s.code}
                    status={s}
                    locked={s.code === 'TODO' || s.code === 'DONE'}
                    onChange={patch => setStatusDefs(ds => ds.map(d => d.code === s.code ? { ...d, ...patch } : d))}
                    onRemove={() => setStatusDefs(ds => ds.filter(d => d.code !== s.code))}
                  />
                ))}
              </div>
            </DragDropProvider>
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
