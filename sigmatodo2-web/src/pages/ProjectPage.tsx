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

  const { data: project } = useQuery({
    queryKey: ['project', code],
    queryFn: () => projects.get(code!),
    enabled: !!code,
  });

  const handleSelectIssue = (issueCode: string | null) => {
    setSelectedIssueCode(issueCode);
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
          { label: code ?? '' },
          ...(selectedIssueCode ? [{ label: selectedIssueCode }] : []),
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r flex flex-col overflow-hidden shrink-0">
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
