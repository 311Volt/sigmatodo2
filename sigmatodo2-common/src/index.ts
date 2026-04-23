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
}

export const DEFAULT_STATUSES: StatusDefinition[] = [
  { code: 'TODO', name: 'To Do', bgColor: '#6366f1', importanceLevel: 3 },
  { code: 'INPROGRESS', name: 'In Progress', bgColor: '#f59e0b', importanceLevel: 4 },
  { code: 'DONE', name: 'Done', bgColor: '#10b981', importanceLevel: 1 },
  { code: 'WONTDO', name: "Won't Do", bgColor: '#6b7280', importanceLevel: 0 },
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
  commentCount: number;
}

export interface IssueWithAssignee extends Issue {
  assignee: User | null;
  creator: User | null;
}

export interface Attachment {
  id: string;
  issueCode: string;
  filename: string;
  uploadedOn: string;
}

export interface Comment {
  id: string;
  issueCode: string;
  postedBy: string;
  postedOn: string;
  editedOn: string | null;
  content: string;
  author?: User;
}

export interface Invitation {
  id: string;
  projectCode: string;
  email: string;
  invitedBy: string;
  createdOn: string;
  acceptedOn: string | null;
  permissions: PermissionsMap;
}

export interface ProjectWithStats extends Project {
  activeIssueCount: number;
  myActiveIssueCount: number;
  myPermissions: PermissionsMap;
}

export type SortOption = 'relevant' | 'created' | 'due' | 'comments';
