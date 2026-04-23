import { createClient } from '@supabase/supabase-js';
import type {
  User, Project, ProjectUser, Issue, IssueWithAssignee,
  Attachment, Comment, Invitation, PermissionsMap,
  ProjectWithStats, Priority, SortOption, StatusDefinition,
} from 'sigmatodo2-common';
import { DEFAULT_STATUSES, OWNER_PERMISSIONS, PRIORITY_ORDER } from 'sigmatodo2-common';
import { config } from '../config';

// Supabase DB adapter — mirrors the SQLiteDB interface.
// Uses the service-role key so it bypasses RLS.
export class SupabaseDB {
  private client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  private get sb() {
    return this.client;
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async getUserByHandle(handle: string): Promise<User | null> {
    const { data } = await this.sb.from('users').select('*').eq('handle', handle).single();
    return data ? this.mapUser(data) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { data } = await this.sb.from('users').select('*').eq('email', email).single();
    return data ? this.mapUser(data) : null;
  }

  async createUser(params: {
    handle: string;
    displayName: string;
    email?: string;
    avatarPath?: string;
  }): Promise<User> {
    const { data } = await this.sb.from('users').insert({
      handle: params.handle,
      display_name: params.displayName,
      email: params.email,
      avatar_path: params.avatarPath,
    }).select().single();
    return this.mapUser(data);
  }

  async updateUser(handle: string, params: {
    displayName?: string;
    avatarPath?: string | null;
    bio?: string | null;
  }): Promise<User> {
    const update: Record<string, unknown> = {};
    if (params.displayName !== undefined) update.display_name = params.displayName;
    if (params.avatarPath !== undefined) update.avatar_path = params.avatarPath;
    if (params.bio !== undefined) update.bio = params.bio;
    const { data } = await this.sb.from('users').update(update).eq('handle', handle).select().single();
    return this.mapUser(data);
  }

  async handleExists(handle: string): Promise<boolean> {
    const { count } = await this.sb.from('users').select('*', { count: 'exact', head: true }).eq('handle', handle);
    return (count ?? 0) > 0;
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async getProjectByCode(code: string): Promise<Project | null> {
    const { data } = await this.sb.from('projects').select('*').eq('code', code).single();
    return data ? this.mapProject(data) : null;
  }

  async getUserProjects(handle: string, myHandle: string): Promise<ProjectWithStats[]> {
    const { data: puRows } = await this.sb
      .from('project_users')
      .select('*, projects(*)')
      .eq('user_handle', handle);
    if (!puRows) return [];
    return Promise.all(puRows.map(async pu => {
      const proj = this.mapProject(pu.projects);
      const { count: activeCount } = await this.sb.from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('project_code', proj.code)
        .not('status', 'in', '(DONE,WONTDO)');
      const { count: myCount } = await this.sb.from('issues')
        .select('*', { count: 'exact', head: true })
        .eq('project_code', proj.code)
        .eq('assigned_to', myHandle)
        .not('status', 'in', '(DONE,WONTDO)');
      return {
        ...proj,
        activeIssueCount: activeCount ?? 0,
        myActiveIssueCount: myCount ?? 0,
        myPermissions: pu.permissions as PermissionsMap,
      };
    }));
  }

  async createProject(params: {
    code: string;
    name: string;
    description?: string;
    ownerHandle: string;
  }): Promise<Project> {
    const { data } = await this.sb.from('projects').insert({
      code: params.code,
      name: params.name,
      description: params.description,
      status_definitions: DEFAULT_STATUSES,
    }).select().single();
    await this.sb.from('project_users').insert({
      user_handle: params.ownerHandle,
      project_code: params.code,
      permissions: OWNER_PERMISSIONS,
    });
    await this.sb.from('issue_sequences').insert({ project_code: params.code, next_number: 1 });
    return this.mapProject(data);
  }

  async updateProject(code: string, params: {
    name?: string;
    description?: string | null;
    backgroundImgPath?: string | null;
    statusDefinitions?: StatusDefinition[];
  }): Promise<Project> {
    const update: Record<string, unknown> = {};
    if (params.name !== undefined) update.name = params.name;
    if (params.description !== undefined) update.description = params.description;
    if (params.backgroundImgPath !== undefined) update.background_img_path = params.backgroundImgPath;
    if (params.statusDefinitions !== undefined) update.status_definitions = params.statusDefinitions;
    const { data } = await this.sb.from('projects').update(update).eq('code', code).select().single();
    return this.mapProject(data);
  }

  async deleteProject(code: string): Promise<void> {
    await this.sb.from('projects').delete().eq('code', code);
  }

  async projectCodeExists(code: string): Promise<boolean> {
    const { count } = await this.sb.from('projects').select('*', { count: 'exact', head: true }).eq('code', code);
    return (count ?? 0) > 0;
  }

  // ── Project users ────────────────────────────────────────────────────────

  async getProjectUser(userHandle: string, projectCode: string): Promise<ProjectUser | null> {
    const { data } = await this.sb.from('project_users')
      .select('*').eq('user_handle', userHandle).eq('project_code', projectCode).single();
    if (!data) return null;
    return { userHandle: data.user_handle, projectCode: data.project_code, permissions: data.permissions };
  }

  async getProjectMembers(projectCode: string): Promise<ProjectUser[]> {
    const { data } = await this.sb.from('project_users')
      .select('*, users(*)').eq('project_code', projectCode);
    return (data ?? []).map(pu => ({
      userHandle: pu.user_handle,
      projectCode: pu.project_code,
      permissions: pu.permissions as PermissionsMap,
      user: pu.users ? this.mapUser(pu.users) : undefined,
    }));
  }

  async addProjectUser(params: { userHandle: string; projectCode: string; permissions: PermissionsMap }): Promise<void> {
    await this.sb.from('project_users').upsert({
      user_handle: params.userHandle,
      project_code: params.projectCode,
      permissions: params.permissions,
    });
  }

  async updateProjectUser(userHandle: string, projectCode: string, permissions: PermissionsMap): Promise<void> {
    await this.sb.from('project_users').update({ permissions })
      .eq('user_handle', userHandle).eq('project_code', projectCode);
  }

  async removeProjectUser(userHandle: string, projectCode: string): Promise<void> {
    await this.sb.from('project_users').delete()
      .eq('user_handle', userHandle).eq('project_code', projectCode);
  }

  // ── Issues ───────────────────────────────────────────────────────────────

  private async nextIssueNumber(projectCode: string): Promise<number> {
    const { data } = await this.sb.rpc('next_issue_number', { p_project_code: projectCode });
    return data as number;
  }

  async createIssue(params: {
    projectCode: string;
    title: string;
    status: string;
    priority?: Priority;
    assignedTo?: string | null;
    createdBy?: string | null;
    dueBy?: string | null;
    markdownDescription?: string | null;
  }): Promise<Issue> {
    const n = await this.nextIssueNumber(params.projectCode);
    const code = `${params.projectCode}-${n}`;
    const { data } = await this.sb.from('issues').insert({
      code,
      project_code: params.projectCode,
      title: params.title,
      status: params.status,
      priority: params.priority ?? 'normal',
      assigned_to: params.assignedTo,
      created_by: params.createdBy ?? null,
      due_by: params.dueBy,
      markdown_description: params.markdownDescription,
    }).select().single();
    return this.mapIssue(data);
  }

  async getIssue(code: string): Promise<Issue | null> {
    const { data } = await this.sb.from('issues').select('*').eq('code', code).single();
    return data ? this.mapIssue(data) : null;
  }

  async getIssueWithAssignee(code: string): Promise<IssueWithAssignee | null> {
    const { data } = await this.sb.from('issues')
      .select('*, assignee:users!assigned_to(*), creator:users!created_by(*)')
      .eq('code', code).single();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      ...this.mapIssue(row),
      assignee: row.assignee ? this.mapUser(row.assignee as Record<string, unknown>) : null,
      creator: row.creator ? this.mapUser(row.creator as Record<string, unknown>) : null,
    };
  }

  async getProjectIssues(projectCode: string, sort: SortOption, myHandle: string): Promise<IssueWithAssignee[]> {
    let query = this.sb.from('issues')
      .select('*, assignee:users!assigned_to(*), creator:users!created_by(*)')
      .eq('project_code', projectCode);
    switch (sort) {
      case 'created': query = query.order('created_on', { ascending: false }); break;
      case 'due': query = query.order('due_by', { ascending: true, nullsFirst: false }); break;
      case 'comments': query = query.order('comment_count', { ascending: false }); break;
      default: break;
    }
    const { data } = await query;
    const issues = (data ?? []).map(row => {
      const r = row as Record<string, unknown>;
      return {
        ...this.mapIssue(r),
        assignee: r.assignee ? this.mapUser(r.assignee as Record<string, unknown>) : null,
        creator: r.creator ? this.mapUser(r.creator as Record<string, unknown>) : null,
      };
    });
    if (sort === 'relevant') return this.sortRelevant(issues, projectCode);
    return issues;
  }

  private async sortRelevant(issues: IssueWithAssignee[], projectCode: string): Promise<IssueWithAssignee[]> {
    const proj = await this.getProjectByCode(projectCode);
    const statusDefs = proj?.statusDefinitions ?? [];
    const importanceMap = Object.fromEntries(statusDefs.map(s => [s.code, s.importanceLevel]));
    const now = Date.now();
    function timeGroup(dueBy: string | null): number {
      if (!dueBy) return 9999;
      const hoursLeft = (new Date(dueBy).getTime() - now) / (1000 * 60 * 60);
      if (hoursLeft <= 0) return -1;
      return Math.floor(Math.log2(hoursLeft + 1));
    }
    return [...issues].sort((a, b) => {
      const impDiff = (importanceMap[b.status] ?? 0) - (importanceMap[a.status] ?? 0);
      if (impDiff !== 0) return impDiff;
      const tgDiff = timeGroup(a.dueBy) - timeGroup(b.dueBy);
      if (tgDiff !== 0) return tgDiff;
      return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
    });
  }

  async updateIssue(code: string, params: {
    title?: string;
    status?: string;
    priority?: Priority;
    assignedTo?: string | null;
    dueBy?: string | null;
    markdownDescription?: string | null;
  }): Promise<Issue> {
    const update: Record<string, unknown> = { updated_on: new Date().toISOString() };
    if (params.title !== undefined) update.title = params.title;
    if (params.status !== undefined) update.status = params.status;
    if (params.priority !== undefined) update.priority = params.priority;
    if (params.assignedTo !== undefined) update.assigned_to = params.assignedTo;
    if (params.dueBy !== undefined) update.due_by = params.dueBy;
    if (params.markdownDescription !== undefined) update.markdown_description = params.markdownDescription;
    const { data } = await this.sb.from('issues').update(update).eq('code', code).select().single();
    return this.mapIssue(data);
  }

  async deleteIssue(code: string): Promise<void> {
    await this.sb.from('issues').delete().eq('code', code);
  }

  // ── Attachments ──────────────────────────────────────────────────────────

  async createAttachment(params: { issueCode: string; filename: string; path: string }): Promise<Attachment> {
    const { data } = await this.sb.from('attachments').insert({
      issue_code: params.issueCode,
      filename: params.filename,
      path: params.path,
    }).select().single();
    return this.mapAttachment(data);
  }

  async getAttachment(id: string): Promise<(Attachment & { path: string }) | null> {
    const { data } = await this.sb.from('attachments').select('*').eq('id', id).single();
    if (!data) return null;
    return { ...this.mapAttachment(data), path: data.path };
  }

  async getIssueAttachments(issueCode: string): Promise<Attachment[]> {
    const { data } = await this.sb.from('attachments').select('*').eq('issue_code', issueCode).order('uploaded_on', { ascending: false });
    return (data ?? []).map(this.mapAttachment);
  }

  async deleteAttachment(id: string): Promise<string | null> {
    const { data } = await this.sb.from('attachments').select('path').eq('id', id).single();
    if (!data) return null;
    await this.sb.from('attachments').delete().eq('id', id);
    return data.path;
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async createComment(params: { issueCode: string; postedBy: string; content: string }): Promise<Comment> {
    const { data } = await this.sb.from('comments').insert({
      issue_code: params.issueCode,
      posted_by: params.postedBy,
      content: params.content,
    }).select('*, users(*)').single();
    await this.sb.rpc('increment_comment_count', { p_issue_code: params.issueCode });
    return this.mapComment(data);
  }

  async getComment(id: string): Promise<Comment | null> {
    const { data } = await this.sb.from('comments').select('*, users(*)').eq('id', id).single();
    return data ? this.mapComment(data) : null;
  }

  async getIssueComments(issueCode: string): Promise<Comment[]> {
    const { data } = await this.sb.from('comments').select('*, users(*)')
      .eq('issue_code', issueCode).order('posted_on', { ascending: true });
    return (data ?? []).map(row => this.mapComment(row));
  }

  async updateComment(id: string, content: string): Promise<Comment> {
    const { data } = await this.sb.from('comments')
      .update({ content, edited_on: new Date().toISOString() })
      .eq('id', id).select('*, users(*)').single();
    return this.mapComment(data);
  }

  async deleteComment(id: string): Promise<void> {
    const { data } = await this.sb.from('comments').select('issue_code').eq('id', id).single();
    if (!data) return;
    await this.sb.from('comments').delete().eq('id', id);
    await this.sb.rpc('decrement_comment_count', { p_issue_code: data.issue_code });
  }

  // ── Invitations ──────────────────────────────────────────────────────────

  async createInvitation(params: {
    projectCode: string;
    email: string;
    invitedBy: string;
    permissions: PermissionsMap;
  }): Promise<Invitation> {
    const { data } = await this.sb.from('invitations').insert({
      project_code: params.projectCode,
      email: params.email,
      invited_by: params.invitedBy,
      permissions: params.permissions,
    }).select().single();
    return this.mapInvitation(data);
  }

  async getInvitation(id: string): Promise<Invitation | null> {
    const { data } = await this.sb.from('invitations').select('*').eq('id', id).single();
    return data ? this.mapInvitation(data) : null;
  }

  async getPendingInvitationsByEmail(email: string): Promise<Invitation[]> {
    const { data } = await this.sb.from('invitations').select('*')
      .eq('email', email).is('accepted_on', null);
    return (data ?? []).map(this.mapInvitation);
  }

  async acceptInvitation(id: string, userHandle: string): Promise<void> {
    const inv = await this.getInvitation(id);
    if (!inv || inv.acceptedOn) return;
    await this.sb.from('invitations').update({ accepted_on: new Date().toISOString() }).eq('id', id);
    await this.addProjectUser({ userHandle, projectCode: inv.projectCode, permissions: inv.permissions });
  }

  async getProjectInvitations(projectCode: string): Promise<Invitation[]> {
    const { data } = await this.sb.from('invitations').select('*')
      .eq('project_code', projectCode).order('created_on', { ascending: false });
    return (data ?? []).map(this.mapInvitation);
  }

  // ── Mappers ──────────────────────────────────────────────────────────────

  private mapUser(row: Record<string, unknown>): User {
    return {
      handle: row.handle as string,
      createdOn: row.created_on as string,
      displayName: row.display_name as string,
      avatarPath: row.avatar_path as string | null,
      bio: row.bio as string | null,
      email: row.email as string | undefined,
    };
  }

  private mapProject(row: Record<string, unknown>): Project {
    return {
      code: row.code as string,
      createdOn: row.created_on as string,
      name: row.name as string,
      backgroundImgPath: row.background_img_path as string | null,
      description: row.description as string | null,
      statusDefinitions: row.status_definitions as StatusDefinition[],
    };
  }

  private mapIssue(row: Record<string, unknown>): Issue {
    return {
      code: row.code as string,
      projectCode: row.project_code as string,
      assignedTo: row.assigned_to as string | null,
      createdBy: row.created_by as string | null,
      priority: row.priority as Priority,
      createdOn: row.created_on as string,
      updatedOn: row.updated_on as string,
      dueBy: row.due_by as string | null,
      title: row.title as string,
      status: row.status as string,
      markdownDescription: row.markdown_description as string | null,
      commentCount: row.comment_count as number,
    };
  }

  private mapAttachment(row: Record<string, unknown>): Attachment {
    return {
      id: row.id as string,
      issueCode: row.issue_code as string,
      filename: row.filename as string,
      uploadedOn: row.uploaded_on as string,
    };
  }

  private mapComment(row: Record<string, unknown>): Comment {
    return {
      id: row.id as string,
      issueCode: row.issue_code as string,
      postedBy: row.posted_by as string,
      postedOn: row.posted_on as string,
      editedOn: row.edited_on as string | null,
      content: row.content as string,
      author: (row.users as Record<string, unknown> | null)
        ? this.mapUser(row.users as Record<string, unknown>)
        : undefined,
    };
  }

  private mapInvitation(row: Record<string, unknown>): Invitation {
    return {
      id: row.id as string,
      projectCode: row.project_code as string,
      email: row.email as string,
      invitedBy: row.invited_by as string,
      createdOn: row.created_on as string,
      acceptedOn: row.accepted_on as string | null,
      permissions: row.permissions as PermissionsMap,
    };
  }
}
