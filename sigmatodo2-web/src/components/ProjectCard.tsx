import type { ProjectWithStats } from 'sigmatodo2-common';

interface ProjectCardProps {
  project: ProjectWithStats;
  onClick: () => void;
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border bg-card shadow-sm overflow-hidden hover:shadow-md transition-shadow w-full"
    >
      <div
        className="h-24 bg-muted bg-cover bg-center"
        style={project.backgroundImgPath ? { backgroundImage: `url(${project.backgroundImgPath})` } : {}}
      />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono text-muted-foreground">{project.code}</span>
        </div>
        <h3 className="font-semibold text-sm leading-tight mb-3 group-hover:text-primary transition-colors">
          {project.name}
        </h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{project.activeIssueCount}</span> open
          </span>
          {project.myActiveIssueCount > 0 && (
            <span>
              <span className="font-medium text-foreground">{project.myActiveIssueCount}</span> assigned to me
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
