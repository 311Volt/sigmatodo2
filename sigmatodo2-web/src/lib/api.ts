import type {
  User, Project, ProjectUser, Issue, IssueWithAssignee,
  Attachment, Comment, Invitation, ProjectWithStats, SortOption,
  StatusDefinition, PermissionsMap,
} from 'sigmatodo2-common';

const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new ApiError(err.error ?? res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────

export const auth = {
  mode: () => request<{ mode: 'dev' | 'prod' }>('/auth/mode'),

  login: (handle: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ handle, password }),
    }),

  register: (handle: string, displayName: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ handle, displayName, password }),
    }),

  me: () => request<User>('/auth/me'),
};

// ── Users ─────────────────────────────────────────────────────────────────

export const users = {
  get: (handle: string) => request<User>(`/users/${handle}`),

  update: (handle: string, data: { displayName?: string; bio?: string | null }) =>
    request<User>(`/users/${handle}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  uploadAvatar: (handle: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<User>(`/users/${handle}/avatar`, { method: 'POST', body: form });
  },
};

// ── Projects ──────────────────────────────────────────────────────────────

export const projects = {
  list: () => request<ProjectWithStats[]>('/projects'),

  create: (data: { code: string; name: string; description?: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  get: (code: string) => request<Project & { myPermissions: PermissionsMap }>(`/projects/${code}`),

  update: (code: string, data: {
    name?: string;
    description?: string | null;
    statusDefinitions?: StatusDefinition[];
  }) => request<Project>(`/projects/${code}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (code: string) => request<void>(`/projects/${code}`, { method: 'DELETE' }),

  uploadBackground: (code: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Project>(`/projects/${code}/background`, { method: 'POST', body: form });
  },

  getMembers: (code: string) => request<ProjectUser[]>(`/projects/${code}/members`),

  invite: (code: string, email: string, role: 'editor' | 'viewer' = 'editor') =>
    request<{ added?: boolean; invited?: boolean; invitation?: Invitation }>(`/projects/${code}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),

  updateMember: (code: string, handle: string, role: 'editor' | 'viewer') =>
    request<{ ok: boolean }>(`/projects/${code}/members/${handle}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeMember: (code: string, handle: string) =>
    request<void>(`/projects/${code}/members/${handle}`, { method: 'DELETE' }),

  getInvitations: (code: string) => request<Invitation[]>(`/projects/${code}/invitations`),
};

// ── Issues ────────────────────────────────────────────────────────────────

export const issues = {
  list: (projectCode: string, sort: SortOption = 'relevant') =>
    request<IssueWithAssignee[]>(`/projects/${projectCode}/issues?sort=${sort}`),

  create: (projectCode: string, data: {
    title: string;
    status: string;
    priority?: string;
    assignedTo?: string | null;
    dueBy?: string | null;
    markdownDescription?: string | null;
  }) => request<Issue>(`/projects/${projectCode}/issues`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  get: (code: string) => request<IssueWithAssignee>(`/issues/${code}`),

  update: (code: string, data: {
    title?: string;
    status?: string;
    priority?: string;
    assignedTo?: string | null;
    dueBy?: string | null;
    markdownDescription?: string | null;
  }) => request<Issue>(`/issues/${code}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (code: string) => request<void>(`/issues/${code}`, { method: 'DELETE' }),
};

// ── Attachments ───────────────────────────────────────────────────────────

export const attachments = {
  list: (issueCode: string) => request<Attachment[]>(`/issues/${issueCode}/attachments`),

  upload: (issueCode: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Attachment>(`/issues/${issueCode}/attachments`, { method: 'POST', body: form });
  },

  getUrl: (id: string) => `/api/attachments/${id}`,

  delete: (id: string) => request<void>(`/attachments/${id}`, { method: 'DELETE' }),
};

// ── Comments ──────────────────────────────────────────────────────────────

export const comments = {
  list: (issueCode: string) => request<Comment[]>(`/issues/${issueCode}/comments`),

  create: (issueCode: string, content: string) =>
    request<Comment>(`/issues/${issueCode}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  update: (id: string, content: string) =>
    request<Comment>(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }),

  delete: (id: string) => request<void>(`/comments/${id}`, { method: 'DELETE' }),
};

export function isWakeupError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiError && err.status >= 502 && err.status <= 504) return true;
  return false;
}
