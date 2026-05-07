export type Priority = 'low' | 'normal' | 'high' | 'highest';

export const PRIORITY_ORDER: Record<Priority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  highest: 3,
};

export interface StatusDefinition {
  code: string;
  name: string;
  bgColor: string;
  importanceLevel: number;
  isActive: boolean;
}

export const DEFAULT_STATUSES: StatusDefinition[] = [
  { code: 'TODO', name: 'To Do', bgColor: '#6366f1', importanceLevel: 3, isActive: true },
  { code: 'INPROGRESS', name: 'In Progress', bgColor: '#f59e0b', importanceLevel: 4, isActive: true },
  { code: 'DONE', name: 'Done', bgColor: '#10b981', importanceLevel: 1, isActive: false },
  { code: 'WONTDO', name: "Won't Do", bgColor: '#6b7280', importanceLevel: 0, isActive: false },
];

export interface User {
  handle: string;
  createdOn: string;
  displayName: string;
  avatarPath: string | null;
  bio: string | null;
  email?: string;
}

export interface Project {
  code: string;
  createdOn: string;
  name: string;
  backgroundImgPath: string | null;
  description: string | null;
  statusDefinitions: StatusDefinition[];
}

export interface PermissionsMap {
  viewIssues: boolean;
  editIssues: boolean;
  changeProjectSettings: boolean;
}

export const OWNER_PERMISSIONS: PermissionsMap = {
  viewIssues: true,
  editIssues: true,
  changeProjectSettings: true,
};

export const MEMBER_PERMISSIONS: PermissionsMap = {
  viewIssues: true,
  editIssues: true,
  changeProjectSettings: false,
};

export const VIEWER_PERMISSIONS: PermissionsMap = {
  viewIssues: true,
  editIssues: false,
  changeProjectSettings: false,
};

export interface ProjectUser {
  userHandle: string;
  projectCode: string;
  permissions: PermissionsMap;
  user?: User;
}

export interface Issue {
  code: string;
  projectCode: string;
  assignedTo: string | null;
  createdBy: string | null;
  priority: Priority;
  createdOn: string;
  updatedOn: string;
  dueBy: string | null;
  title: string;
  status: string;
  markdownDescription: string | null;
  renderedMarkdownDescription?: string | null;
  commentCount: number;
}

export interface IssueWithAssignee extends Issue {
  assignee: User | null;
  creator: User | null;
}

export interface Attachment {
  id: string;
  projectCode: string;
  issueCode: string;
  filename: string;
  mimeType: string;
  uploadedOn: string;
}

export interface Comment {
  id: string;
  issueCode: string;
  postedBy: string;
  postedOn: string;
  editedOn: string | null;
  content: string;
  renderedContent?: string;
  author?: User;
}

export interface Invitation {
  id: string;
  projectCode: string;
  invitationCode: string;
  invitedBy: string;
  invitationFor: string | null;
  createdOn: string;
  acceptedOn: string | null;
  expiresAt: string | null;
  permissions: PermissionsMap;
  singleUse: boolean;
}

export interface InvitationDetails extends Invitation {
  project: Project;
  inviter: User;
}

export interface ProjectWithStats extends Project {
  activeIssueCount: number;
  myActiveIssueCount: number;
  myPermissions: PermissionsMap;
}

export type SortOption = 'relevant' | 'created' | 'due' | 'comments';
