import { Database } from 'bun:sqlite';
import { randomUUID } from 'crypto';
import type {
  User, Project, ProjectUser, Issue, IssueWithAssignee,
  Attachment, Comment, Invitation, PermissionsMap,
  ProjectWithStats, Priority, SortOption, StatusDefinition,
} from 'sigmatodo2-common';
import { DEFAULT_STATUSES, OWNER_PERMISSIONS, PRIORITY_ORDER } from 'sigmatodo2-common';

function parseJSON<T>(s: string): T {
  return JSON.parse(s) as T;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    handle: row.handle as string,
    createdOn: row.created_on as string,
    displayName: row.display_name as string,
    avatarPath: row.avatar_path as string | null,
    bio: row.bio as string | null,
    email: row.email as string | undefined,
  };
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    code: row.code as string,
    createdOn: row.created_on as string,
    name: row.name as string,
    backgroundImgPath: row.background_img_path as string | null,
    description: row.description as string | null,
    statusDefinitions: parseJSON<StatusDefinition[]>(row.status_definitions as string),
  };
}

function rowToIssue(row: Record<string, unknown>): Issue {
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

function rowToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    issueCode: row.issue_code as string,
    postedBy: row.posted_by as string,
    postedOn: row.posted_on as string,
    editedOn: row.edited_on as string | null,
    content: row.content as string,
  };
}

export class SQLiteDB {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        handle TEXT PRIMARY KEY,
        created_on TEXT NOT NULL DEFAULT (datetime('now')),
        display_name TEXT NOT NULL,
        avatar_path TEXT,
        bio TEXT,
        email TEXT UNIQUE,
        password_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        code TEXT PRIMARY KEY,
        created_on TEXT NOT NULL DEFAULT (datetime('now')),
        name TEXT NOT NULL,
        background_img_path TEXT,
        description TEXT,
        status_definitions TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_users (
        user_handle TEXT NOT NULL,
        project_code TEXT NOT NULL,
        permissions TEXT NOT NULL,
        PRIMARY KEY (user_handle, project_code),
        FOREIGN KEY (user_handle) REFERENCES users(handle) ON DELETE CASCADE,
        FOREIGN KEY (project_code) REFERENCES projects(code) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS issue_sequences (
        project_code TEXT PRIMARY KEY,
        next_number INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (project_code) REFERENCES projects(code) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS issues (
        code TEXT PRIMARY KEY,
        project_code TEXT NOT NULL,
        assigned_to TEXT,
        created_by TEXT,
        priority TEXT NOT NULL DEFAULT 'normal',
        created_on TEXT NOT NULL DEFAULT (datetime('now')),
        updated_on TEXT NOT NULL DEFAULT (datetime('now')),
        due_by TEXT,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        markdown_description TEXT,
        comment_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (project_code) REFERENCES projects(code) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES users(handle) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(handle) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        issue_code TEXT NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        uploaded_on TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (issue_code) REFERENCES issues(code) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        issue_code TEXT NOT NULL,
        posted_by TEXT NOT NULL,
        posted_on TEXT NOT NULL DEFAULT (datetime('now')),
        edited_on TEXT,
        content TEXT NOT NULL,
        FOREIGN KEY (issue_code) REFERENCES issues(code) ON DELETE CASCADE,
        FOREIGN KEY (posted_by) REFERENCES users(handle) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS invitations (
        id TEXT PRIMARY KEY,
        project_code TEXT NOT NULL,
        email TEXT NOT NULL,
        invited_by TEXT NOT NULL,
        created_on TEXT NOT NULL DEFAULT (datetime('now')),
        accepted_on TEXT,
        permissions TEXT NOT NULL,
        FOREIGN KEY (project_code) REFERENCES projects(code) ON DELETE CASCADE,
        FOREIGN KEY (invited_by) REFERENCES users(handle)
      );
    `);

    const issueColumns = (this.db.query('PRAGMA table_info(issues)').all() as { name: string }[]).map(c => c.name);
    if (!issueColumns.includes('created_by')) {
      this.db.exec('ALTER TABLE issues ADD COLUMN created_by TEXT REFERENCES users(handle) ON DELETE SET NULL');
    }
  }

  // ── Users ────────────────────────────────────────────────────────────────

  getUserByHandle(handle: string): User | null {
    const row = this.db.query('SELECT * FROM users WHERE handle = ?').get(handle) as Record<string, unknown> | null;
    return row ? rowToUser(row) : null;
  }

  getUserByEmail(email: string): User | null {
    const row = this.db.query('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | null;
    return row ? rowToUser(row) : null;
  }

  getUserPasswordHash(handle: string): string | null {
    const row = this.db.query('SELECT password_hash FROM users WHERE handle = ?').get(handle) as { password_hash: string | null } | null;
    return row?.password_hash ?? null;
  }

  createUser(params: {
    handle: string;
    displayName: string;
    email?: string;
    passwordHash?: string;
    avatarPath?: string;
  }): User {
    this.db.query(`
      INSERT INTO users (handle, display_name, email, password_hash, avatar_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(params.handle, params.displayName, params.email ?? null, params.passwordHash ?? null, params.avatarPath ?? null);
    return this.getUserByHandle(params.handle)!;
  }

  updateUser(handle: string, params: {
    displayName?: string;
    avatarPath?: string | null;
    bio?: string | null;
  }): User {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (params.displayName !== undefined) { fields.push('display_name = ?'); values.push(params.displayName); }
    if (params.avatarPath !== undefined) { fields.push('avatar_path = ?'); values.push(params.avatarPath); }
    if (params.bio !== undefined) { fields.push('bio = ?'); values.push(params.bio); }
    if (fields.length > 0) {
      values.push(handle);
      this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE handle = ?`).run(...values);
    }
    return this.getUserByHandle(handle)!;
  }

  handleExists(handle: string): boolean {
    const row = this.db.query('SELECT 1 FROM users WHERE handle = ?').get(handle);
    return row !== null;
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  getProjectByCode(code: string): Project | null {
    const row = this.db.query('SELECT * FROM projects WHERE code = ?').get(code) as Record<string, unknown> | null;
    return row ? rowToProject(row) : null;
  }

  getUserProjects(handle: string, myHandle: string): ProjectWithStats[] {
    const rows = this.db.query(`
      SELECT p.*, pu.permissions,
        (SELECT COUNT(*) FROM issues i
          WHERE i.project_code = p.code
            AND i.status NOT IN (
              SELECT json_extract(sd.value, '$.code')
              FROM json_each(p.status_definitions) sd
              WHERE json_extract(sd.value, '$.importanceLevel') = 0
            )
        ) as active_issue_count,
        (SELECT COUNT(*) FROM issues WHERE project_code = p.code AND assigned_to = ? AND status NOT IN ('DONE','WONTDO')) as my_active_issue_count
      FROM projects p
      JOIN project_users pu ON pu.project_code = p.code AND pu.user_handle = ?
      ORDER BY p.created_on DESC
    `).all(myHandle, handle) as Record<string, unknown>[];

    return rows.map(row => ({
      ...rowToProject(row),
      activeIssueCount: row.active_issue_count as number,
      myActiveIssueCount: row.my_active_issue_count as number,
      myPermissions: parseJSON<PermissionsMap>(row.permissions as string),
    }));
  }

  createProject(params: {
    code: string;
    name: string;
    description?: string;
    ownerHandle: string;
  }): Project {
    const statusDefs = JSON.stringify(DEFAULT_STATUSES);
    this.db.transaction(() => {
      this.db.query(`
        INSERT INTO projects (code, name, description, status_definitions)
        VALUES (?, ?, ?, ?)
      `).run(params.code, params.name, params.description ?? null, statusDefs);
      this.db.query(`
        INSERT INTO project_users (user_handle, project_code, permissions)
        VALUES (?, ?, ?)
      `).run(params.ownerHandle, params.code, JSON.stringify(OWNER_PERMISSIONS));
      this.db.query(`
        INSERT INTO issue_sequences (project_code, next_number) VALUES (?, 1)
      `).run(params.code);
    })();
    return this.getProjectByCode(params.code)!;
  }

  updateProject(code: string, params: {
    name?: string;
    description?: string | null;
    backgroundImgPath?: string | null;
    statusDefinitions?: StatusDefinition[];
  }): Project {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (params.name !== undefined) { fields.push('name = ?'); values.push(params.name); }
    if (params.description !== undefined) { fields.push('description = ?'); values.push(params.description); }
    if (params.backgroundImgPath !== undefined) { fields.push('background_img_path = ?'); values.push(params.backgroundImgPath); }
    if (params.statusDefinitions !== undefined) { fields.push('status_definitions = ?'); values.push(JSON.stringify(params.statusDefinitions)); }
    if (fields.length > 0) {
      values.push(code);
      this.db.query(`UPDATE projects SET ${fields.join(', ')} WHERE code = ?`).run(...values);
    }
    return this.getProjectByCode(code)!;
  }

  deleteProject(code: string): void {
    this.db.query('DELETE FROM projects WHERE code = ?').run(code);
  }

  projectCodeExists(code: string): boolean {
    const row = this.db.query('SELECT 1 FROM projects WHERE code = ?').get(code);
    return row !== null;
  }

  // ── Project users ────────────────────────────────────────────────────────

  getProjectUser(userHandle: string, projectCode: string): ProjectUser | null {
    const row = this.db.query(
      'SELECT * FROM project_users WHERE user_handle = ? AND project_code = ?'
    ).get(userHandle, projectCode) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      userHandle: row.user_handle as string,
      projectCode: row.project_code as string,
      permissions: parseJSON<PermissionsMap>(row.permissions as string),
    };
  }

  getProjectMembers(projectCode: string): ProjectUser[] {
    const rows = this.db.query(`
      SELECT pu.*, u.handle, u.display_name, u.avatar_path, u.bio, u.created_on as user_created_on
      FROM project_users pu
      JOIN users u ON u.handle = pu.user_handle
      WHERE pu.project_code = ?
    `).all(projectCode) as Record<string, unknown>[];
    return rows.map(row => ({
      userHandle: row.user_handle as string,
      projectCode: row.project_code as string,
      permissions: parseJSON<PermissionsMap>(row.permissions as string),
      user: {
        handle: row.handle as string,
        createdOn: row.user_created_on as string,
        displayName: row.display_name as string,
        avatarPath: row.avatar_path as string | null,
        bio: row.bio as string | null,
      },
    }));
  }

  addProjectUser(params: { userHandle: string; projectCode: string; permissions: PermissionsMap }): void {
    this.db.query(`
      INSERT OR REPLACE INTO project_users (user_handle, project_code, permissions)
      VALUES (?, ?, ?)
    `).run(params.userHandle, params.projectCode, JSON.stringify(params.permissions));
  }

  updateProjectUser(userHandle: string, projectCode: string, permissions: PermissionsMap): void {
    this.db.query(
      'UPDATE project_users SET permissions = ? WHERE user_handle = ? AND project_code = ?'
    ).run(JSON.stringify(permissions), userHandle, projectCode);
  }

  removeProjectUser(userHandle: string, projectCode: string): void {
    this.db.query(
      'DELETE FROM project_users WHERE user_handle = ? AND project_code = ?'
    ).run(userHandle, projectCode);
  }

  // ── Issues ───────────────────────────────────────────────────────────────

  private nextIssueNumber(projectCode: string): number {
    let num = 1;
    this.db.transaction(() => {
      const row = this.db.query(
        'SELECT next_number FROM issue_sequences WHERE project_code = ?'
      ).get(projectCode) as { next_number: number } | null;
      num = row?.next_number ?? 1;
      this.db.query(
        'UPDATE issue_sequences SET next_number = next_number + 1 WHERE project_code = ?'
      ).run(projectCode);
    })();
    return num;
  }

  createIssue(params: {
    projectCode: string;
    title: string;
    status: string;
    priority?: Priority;
    assignedTo?: string | null;
    createdBy?: string | null;
    dueBy?: string | null;
    markdownDescription?: string | null;
  }): Issue {
    const n = this.nextIssueNumber(params.projectCode);
    const code = `${params.projectCode}-${n}`;
    this.db.query(`
      INSERT INTO issues (code, project_code, title, status, priority, assigned_to, created_by, due_by, markdown_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, params.projectCode, params.title, params.status,
      params.priority ?? 'normal', params.assignedTo ?? null,
      params.createdBy ?? null, params.dueBy ?? null, params.markdownDescription ?? null,
    );
    return this.getIssue(code)!;
  }

  getIssue(code: string): Issue | null {
    const row = this.db.query('SELECT * FROM issues WHERE code = ?').get(code) as Record<string, unknown> | null;
    return row ? rowToIssue(row) : null;
  }

  getIssueWithAssignee(code: string): IssueWithAssignee | null {
    const row = this.db.query(`
      SELECT i.*,
        u.handle as u_handle, u.display_name as u_display_name, u.avatar_path as u_avatar_path, u.bio as u_bio, u.created_on as u_created_on,
        cr.handle as cr_handle, cr.display_name as cr_display_name, cr.avatar_path as cr_avatar_path, cr.bio as cr_bio, cr.created_on as cr_created_on
      FROM issues i
      LEFT JOIN users u ON u.handle = i.assigned_to
      LEFT JOIN users cr ON cr.handle = i.created_by
      WHERE i.code = ?
    `).get(code) as Record<string, unknown> | null;
    if (!row) return null;
    const issue = rowToIssue(row);
    const assignee: User | null = row.u_handle ? {
      handle: row.u_handle as string,
      createdOn: row.u_created_on as string,
      displayName: row.u_display_name as string,
      avatarPath: row.u_avatar_path as string | null,
      bio: row.u_bio as string | null,
    } : null;
    const creator: User | null = row.cr_handle ? {
      handle: row.cr_handle as string,
      createdOn: row.cr_created_on as string,
      displayName: row.cr_display_name as string,
      avatarPath: row.cr_avatar_path as string | null,
      bio: row.cr_bio as string | null,
    } : null;
    return { ...issue, assignee, creator };
  }

  getProjectIssues(projectCode: string, sort: SortOption, myHandle: string): IssueWithAssignee[] {
    let orderBy: string;
    switch (sort) {
      case 'created': orderBy = 'i.created_on DESC'; break;
      case 'due': orderBy = 'CASE WHEN i.due_by IS NULL THEN 1 ELSE 0 END, i.due_by ASC'; break;
      case 'comments': orderBy = 'i.comment_count DESC'; break;
      default: orderBy = 'i.created_on DESC'; // computed in JS for 'relevant'
    }

    const rows = this.db.query(`
      SELECT i.*,
        u.handle as u_handle, u.display_name as u_display_name, u.avatar_path as u_avatar_path, u.bio as u_bio, u.created_on as u_created_on,
        cr.handle as cr_handle, cr.display_name as cr_display_name, cr.avatar_path as cr_avatar_path, cr.bio as cr_bio, cr.created_on as cr_created_on
      FROM issues i
      LEFT JOIN users u ON u.handle = i.assigned_to
      LEFT JOIN users cr ON cr.handle = i.created_by
      WHERE i.project_code = ?
      ORDER BY ${orderBy}
    `).all(projectCode) as Record<string, unknown>[];

    const issues: IssueWithAssignee[] = rows.map(row => {
      const issue = rowToIssue(row);
      const assignee: User | null = row.u_handle ? {
        handle: row.u_handle as string,
        createdOn: row.u_created_on as string,
        displayName: row.u_display_name as string,
        avatarPath: row.u_avatar_path as string | null,
        bio: row.u_bio as string | null,
      } : null;
      const creator: User | null = row.cr_handle ? {
        handle: row.cr_handle as string,
        createdOn: row.cr_created_on as string,
        displayName: row.cr_display_name as string,
        avatarPath: row.cr_avatar_path as string | null,
        bio: row.cr_bio as string | null,
      } : null;
      return { ...issue, assignee, creator };
    });

    if (sort === 'relevant') {
      return sortRelevant(issues, projectCode, this);
    }
    return issues;
  }

  getProjectStatusDefs(projectCode: string): StatusDefinition[] {
    const row = this.db.query('SELECT status_definitions FROM projects WHERE code = ?').get(projectCode) as { status_definitions: string } | null;
    if (!row) return [];
    return parseJSON<StatusDefinition[]>(row.status_definitions);
  }

  updateIssue(code: string, params: {
    title?: string;
    status?: string;
    priority?: Priority;
    assignedTo?: string | null;
    dueBy?: string | null;
    markdownDescription?: string | null;
  }): Issue {
    const fields: string[] = ["updated_on = datetime('now')"];
    const values: unknown[] = [];
    if (params.title !== undefined) { fields.push('title = ?'); values.push(params.title); }
    if (params.status !== undefined) { fields.push('status = ?'); values.push(params.status); }
    if (params.priority !== undefined) { fields.push('priority = ?'); values.push(params.priority); }
    if (params.assignedTo !== undefined) { fields.push('assigned_to = ?'); values.push(params.assignedTo); }
    if (params.dueBy !== undefined) { fields.push('due_by = ?'); values.push(params.dueBy); }
    if (params.markdownDescription !== undefined) { fields.push('markdown_description = ?'); values.push(params.markdownDescription); }
    values.push(code);
    this.db.query(`UPDATE issues SET ${fields.join(', ')} WHERE code = ?`).run(...values);
    return this.getIssue(code)!;
  }

  deleteIssue(code: string): void {
    this.db.query('DELETE FROM issues WHERE code = ?').run(code);
  }

  // ── Attachments ──────────────────────────────────────────────────────────

  createAttachment(params: { issueCode: string; filename: string; path: string }): Attachment {
    const id = randomUUID();
    this.db.query(`
      INSERT INTO attachments (id, issue_code, filename, path)
      VALUES (?, ?, ?, ?)
    `).run(id, params.issueCode, params.filename, params.path);
    return this.getAttachment(id)!;
  }

  getAttachment(id: string): Attachment & { path: string } | null {
    const row = this.db.query('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row.id as string,
      issueCode: row.issue_code as string,
      filename: row.filename as string,
      uploadedOn: row.uploaded_on as string,
      path: row.path as string,
    };
  }

  getIssueAttachments(issueCode: string): Attachment[] {
    const rows = this.db.query(
      'SELECT * FROM attachments WHERE issue_code = ? ORDER BY uploaded_on DESC'
    ).all(issueCode) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      issueCode: row.issue_code as string,
      filename: row.filename as string,
      uploadedOn: row.uploaded_on as string,
    }));
  }

  deleteAttachment(id: string): string | null {
    const row = this.db.query('SELECT path FROM attachments WHERE id = ?').get(id) as { path: string } | null;
    if (!row) return null;
    this.db.query('DELETE FROM attachments WHERE id = ?').run(id);
    return row.path;
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  createComment(params: { issueCode: string; postedBy: string; content: string }): Comment {
    const id = randomUUID();
    this.db.transaction(() => {
      this.db.query(`
        INSERT INTO comments (id, issue_code, posted_by, content)
        VALUES (?, ?, ?, ?)
      `).run(id, params.issueCode, params.postedBy, params.content);
      this.db.query(
        'UPDATE issues SET comment_count = comment_count + 1 WHERE code = ?'
      ).run(params.issueCode);
    })();
    return this.getComment(id)!;
  }

  getComment(id: string): Comment | null {
    const row = this.db.query('SELECT * FROM comments WHERE id = ?').get(id) as Record<string, unknown> | null;
    return row ? rowToComment(row) : null;
  }

  getIssueComments(issueCode: string): Comment[] {
    const rows = this.db.query(`
      SELECT c.*, u.display_name, u.avatar_path, u.bio, u.created_on as u_created_on
      FROM comments c
      JOIN users u ON u.handle = c.posted_by
      WHERE c.issue_code = ?
      ORDER BY c.posted_on ASC
    `).all(issueCode) as Record<string, unknown>[];
    return rows.map(row => ({
      ...rowToComment(row),
      author: {
        handle: row.posted_by as string,
        createdOn: row.u_created_on as string,
        displayName: row.display_name as string,
        avatarPath: row.avatar_path as string | null,
        bio: row.bio as string | null,
      },
    }));
  }

  updateComment(id: string, content: string): Comment {
    this.db.query(
      "UPDATE comments SET content = ?, edited_on = datetime('now') WHERE id = ?"
    ).run(content, id);
    return this.getComment(id)!;
  }

  deleteComment(id: string): void {
    const row = this.db.query('SELECT issue_code FROM comments WHERE id = ?').get(id) as { issue_code: string } | null;
    if (!row) return;
    this.db.transaction(() => {
      this.db.query('DELETE FROM comments WHERE id = ?').run(id);
      this.db.query(
        'UPDATE issues SET comment_count = MAX(0, comment_count - 1) WHERE code = ?'
      ).run(row.issue_code);
    })();
  }

  // ── Invitations ──────────────────────────────────────────────────────────

  createInvitation(params: {
    projectCode: string;
    email: string;
    invitedBy: string;
    permissions: PermissionsMap;
  }): Invitation {
    const id = randomUUID();
    this.db.query(`
      INSERT INTO invitations (id, project_code, email, invited_by, permissions)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, params.projectCode, params.email, params.invitedBy, JSON.stringify(params.permissions));
    return this.getInvitation(id)!;
  }

  getInvitation(id: string): Invitation | null {
    const row = this.db.query('SELECT * FROM invitations WHERE id = ?').get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      id: row.id as string,
      projectCode: row.project_code as string,
      email: row.email as string,
      invitedBy: row.invited_by as string,
      createdOn: row.created_on as string,
      acceptedOn: row.accepted_on as string | null,
      permissions: parseJSON<PermissionsMap>(row.permissions as string),
    };
  }

  getPendingInvitationsByEmail(email: string): Invitation[] {
    const rows = this.db.query(
      'SELECT * FROM invitations WHERE email = ? AND accepted_on IS NULL'
    ).all(email) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      projectCode: row.project_code as string,
      email: row.email as string,
      invitedBy: row.invited_by as string,
      createdOn: row.created_on as string,
      acceptedOn: null,
      permissions: parseJSON<PermissionsMap>(row.permissions as string),
    }));
  }

  acceptInvitation(id: string, userHandle: string): void {
    const inv = this.getInvitation(id);
    if (!inv || inv.acceptedOn) return;
    this.db.transaction(() => {
      this.db.query(
        "UPDATE invitations SET accepted_on = datetime('now') WHERE id = ?"
      ).run(id);
      this.db.query(`
        INSERT OR IGNORE INTO project_users (user_handle, project_code, permissions)
        VALUES (?, ?, ?)
      `).run(userHandle, inv.projectCode, JSON.stringify(inv.permissions));
    })();
  }

  getProjectInvitations(projectCode: string): Invitation[] {
    const rows = this.db.query(
      'SELECT * FROM invitations WHERE project_code = ? ORDER BY created_on DESC'
    ).all(projectCode) as Record<string, unknown>[];
    return rows.map(row => ({
      id: row.id as string,
      projectCode: row.project_code as string,
      email: row.email as string,
      invitedBy: row.invited_by as string,
      createdOn: row.created_on as string,
      acceptedOn: row.accepted_on as string | null,
      permissions: parseJSON<PermissionsMap>(row.permissions as string),
    }));
  }
}

function sortRelevant(issues: IssueWithAssignee[], projectCode: string, db: SQLiteDB): IssueWithAssignee[] {
  const statusDefs = db.getProjectStatusDefs(projectCode);
  const importanceMap = Object.fromEntries(statusDefs.map(s => [s.code, s.importanceLevel]));
  const now = Date.now();

  function timeGroup(dueBy: string | null): number {
    if (!dueBy) return 9999;
    const hoursLeft = (new Date(dueBy).getTime() - now) / (1000 * 60 * 60);
    if (hoursLeft <= 0) return -1;
    return Math.floor(Math.log2(hoursLeft + 1));
  }

  return [...issues].sort((a, b) => {
    const impA = importanceMap[a.status] ?? 0;
    const impB = importanceMap[b.status] ?? 0;
    if (impB !== impA) return impB - impA;

    const tgA = timeGroup(a.dueBy);
    const tgB = timeGroup(b.dueBy);
    if (tgA !== tgB) return tgA - tgB;

    return (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0);
  });
}
