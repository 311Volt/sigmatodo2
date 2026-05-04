import { pgTable, text, integer, timestamp, jsonb, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { StatusDefinition, PermissionsMap } from 'sigmatodo2-common';

export const users = pgTable('users', {
  handle: text('handle').primaryKey(),
  createdOn: timestamp('created_on').defaultNow().notNull(),
  displayName: text('display_name').notNull(),
  avatarPath: text('avatar_path'),
  bio: text('bio'),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
});

export const projects = pgTable('projects', {
  code: text('code').primaryKey(),
  createdOn: timestamp('created_on').defaultNow().notNull(),
  name: text('name').notNull(),
  backgroundImgPath: text('background_img_path'),
  description: text('description'),
  statusDefinitions: jsonb('status_definitions').$type<StatusDefinition[]>().notNull(),
});

export const projectUsers = pgTable('project_users', {
  userHandle: text('user_handle').notNull().references(() => users.handle, { onDelete: 'cascade' }),
  projectCode: text('project_code').notNull().references(() => projects.code, { onDelete: 'cascade' }),
  permissions: jsonb('permissions').$type<PermissionsMap>().notNull(),
}, (t) => [primaryKey({ columns: [t.userHandle, t.projectCode] })]);

export const issueSequences = pgTable('issue_sequences', {
  projectCode: text('project_code').primaryKey().references(() => projects.code, { onDelete: 'cascade' }),
  nextNumber: integer('next_number').notNull().default(1),
});

export const issues = pgTable('issues', {
  code: text('code').primaryKey(),
  projectCode: text('project_code').notNull().references(() => projects.code, { onDelete: 'cascade' }),
  assignedTo: text('assigned_to').references(() => users.handle, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => users.handle, { onDelete: 'set null' }),
  priority: text('priority').notNull().default('normal'),
  createdOn: timestamp('created_on').defaultNow().notNull(),
  updatedOn: timestamp('updated_on').defaultNow().notNull(),
  dueBy: timestamp('due_by', { withTimezone: true }),
  title: text('title').notNull(),
  status: text('status').notNull(),
  markdownDescription: text('markdown_description'),
  commentCount: integer('comment_count').notNull().default(0),
});

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueCode: text('issue_code').notNull().references(() => issues.code, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  path: text('path').notNull(),
  uploadedOn: timestamp('uploaded_on').defaultNow().notNull(),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueCode: text('issue_code').notNull().references(() => issues.code, { onDelete: 'cascade' }),
  postedBy: text('posted_by').notNull().references(() => users.handle, { onDelete: 'cascade' }),
  postedOn: timestamp('posted_on').defaultNow().notNull(),
  editedOn: timestamp('edited_on'),
  content: text('content').notNull(),
});

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectCode: text('project_code').notNull().references(() => projects.code, { onDelete: 'cascade' }),
  invitationCode: uuid('invitation_code').notNull().unique().defaultRandom(),
  invitedBy: text('invited_by').notNull().references(() => users.handle),
  invitationFor: text('invitation_for').references(() => users.handle, { onDelete: 'set null' }),
  createdOn: timestamp('created_on').defaultNow().notNull(),
  acceptedOn: timestamp('accepted_on'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  permissions: jsonb('permissions').$type<PermissionsMap>().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  projectUsers: many(projectUsers),
  assignedIssues: many(issues, { relationName: 'issue_assignee' }),
  createdIssues: many(issues, { relationName: 'issue_creator' }),
  comments: many(comments),
  sentInvitations: many(invitations, { relationName: 'invitation_inviter' }),
  targetedInvitations: many(invitations, { relationName: 'invitation_for_user' }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  projectUsers: many(projectUsers),
  issues: many(issues),
  invitations: many(invitations),
}));

export const projectUsersRelations = relations(projectUsers, ({ one }) => ({
  user: one(users, { fields: [projectUsers.userHandle], references: [users.handle] }),
  project: one(projects, { fields: [projectUsers.projectCode], references: [projects.code] }),
}));

export const issueSequencesRelations = relations(issueSequences, ({ one }) => ({
  project: one(projects, { fields: [issueSequences.projectCode], references: [projects.code] }),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  project: one(projects, { fields: [issues.projectCode], references: [projects.code] }),
  assignee: one(users, { fields: [issues.assignedTo], references: [users.handle], relationName: 'issue_assignee' }),
  creator: one(users, { fields: [issues.createdBy], references: [users.handle], relationName: 'issue_creator' }),
  attachments: many(attachments),
  comments: many(comments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  issue: one(issues, { fields: [attachments.issueCode], references: [issues.code] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  issue: one(issues, { fields: [comments.issueCode], references: [issues.code] }),
  author: one(users, { fields: [comments.postedBy], references: [users.handle] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  project: one(projects, { fields: [invitations.projectCode], references: [projects.code] }),
  inviter: one(users, { fields: [invitations.invitedBy], references: [users.handle], relationName: 'invitation_inviter' }),
  invitationForUser: one(users, { fields: [invitations.invitationFor], references: [users.handle], relationName: 'invitation_for_user' }),
}));
