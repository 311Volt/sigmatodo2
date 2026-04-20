import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { projects } from '@/lib/api';
import TopBar from '@/components/TopBar';
import ProjectCard from '@/components/ProjectCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

export default function WelcomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [error, setError] = useState('');

  const { data: projectList = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: projects.list,
  });

  const create = useMutation({
    mutationFn: () => projects.create({
      code: form.code.toUpperCase(),
      name: form.name,
      description: form.description || undefined,
    }),
    onSuccess: proj => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setOpen(false);
      setForm({ code: '', name: '', description: '' });
      navigate(`/projects/${proj.code}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar breadcrumbs={[{ label: 'My Projects' }]} />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My Projects</h1>
          <Button onClick={() => { setOpen(true); setError(''); }}>
            <Plus className="size-4 mr-1" /> New Project
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : projectList.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">No projects yet.</p>
            <p className="text-sm mt-1">Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projectList.map(p => (
              <ProjectCard
                key={p.code}
                project={p}
                onClick={() => navigate(`/projects/${p.code}`)}
              />
            ))}
          </div>
        )}
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); create.mutate(); }}
            className="flex flex-col gap-4"
          >
            <div className="space-y-1">
              <Label>Code <span className="text-muted-foreground text-xs">(2–8 uppercase letters)</span></Label>
              <Input
                placeholder="SIG"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                maxLength={8}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="My Project"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                placeholder="What's this project about?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
