import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projects } from '@/lib/api';
import TopBar from '@/components/TopBar';
import IssueList from '@/components/IssueList';
import IssueDetails from '@/components/IssueDetails';
import ProjectDetails from '@/components/ProjectDetails';
import type { SortOption } from 'sigmatodo2-common';

export default function ProjectPage() {
  const { code, issueCode: routeIssueCode } = useParams<{ code: string; issueCode?: string }>();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortOption>('relevant');
  const [selectedIssueCode, setSelectedIssueCode] = useState<string | null>(routeIssueCode ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', code],
    queryFn: () => projects.get(code!),
    enabled: !!code,
  });

  const handleSelectIssue = (issueCode: string | null) => {
    setSelectedIssueCode(issueCode);
    setSidebarOpen(false);
    if (issueCode) {
      navigate(`/projects/${code}/issues/${issueCode}`, { replace: true });
    } else {
      navigate(`/projects/${code}`, { replace: true });
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        breadcrumbs={[
          { label: 'My Projects', href: '/' },
          { label: code ?? '', ...(selectedIssueCode ? { onClick: () => handleSelectIssue(null) } : {}) },
          ...(selectedIssueCode ? [{ label: selectedIssueCode }] : []),
        ]}
        onMenuToggle={() => setSidebarOpen(o => !o)}
      />
      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/40 min-[800px]:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside className={`w-80 border-r bg-background flex flex-col overflow-hidden shrink-0 transition-transform duration-200 ease-in-out absolute inset-y-0 left-0 z-50 min-[800px]:relative min-[800px]:inset-auto min-[800px]:z-auto min-[800px]:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {code && (
            <IssueList
              projectCode={code}
              sort={sort}
              onSortChange={setSort}
              selectedCode={selectedIssueCode}
              onSelect={handleSelectIssue}
              statusDefinitions={project?.statusDefinitions ?? []}
            />
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          {selectedIssueCode ? (
            <IssueDetails
              issueCode={selectedIssueCode}
              project={project}
              onClose={() => handleSelectIssue(null)}
            />
          ) : (
            <ProjectDetails project={project} projectCode={code!} />
          )}
        </main>
      </div>
    </div>
  );
}
