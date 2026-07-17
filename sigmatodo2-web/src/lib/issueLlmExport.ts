import { XMLBuilder } from 'fast-xml-parser';
import type {
  Attachment,
  Comment,
  IssueWithAssignee,
  PermissionsMap,
  Project,
  ProjectUser,
  StatusDefinition,
  User,
} from 'sigmatodo2-common';

const COMMENT_FIELD_CHAR_LIMIT = 700;
const COMMENT_TEXT_CHAR_BUDGET = 20_000;

type ProjectWithPermissions = Project & { myPermissions?: PermissionsMap };

export interface IssueLlmExportInput {
  issue: IssueWithAssignee;
  project?: ProjectWithPermissions | null;
  attachments?: Attachment[];
  comments?: Comment[];
  members?: ProjectUser[];
  generatedAt?: string | Date;
  getAttachmentUrl?: (attachment: Attachment) => string;
}

interface CommentTextBudget {
  remaining: number;
  used: number;
  truncatedCount: number;
}

type TextNode = {
  '#text': string;
  '@_truncated'?: 'true';
  '@_originalLength'?: number;
  '@_includedLength'?: number;
};

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  format: true,
  indentBy: '  ',
  processEntities: true,
  suppressBooleanAttributes: false,
  suppressEmptyNode: false,
});

export function formatIssueForLlmXml({
  issue,
  project = null,
  attachments = [],
  comments = [],
  members = [],
  generatedAt = new Date(),
  getAttachmentUrl = attachment => `/api/attachments/${attachment.id}`,
}: IssueLlmExportInput): string {
  const statusDefinition = project?.statusDefinitions.find(status => status.code === issue.status) ?? null;
  const commentBudget: CommentTextBudget = {
    remaining: COMMENT_TEXT_CHAR_BUDGET,
    used: 0,
    truncatedCount: 0,
  };
  const sortedComments = [...comments].sort(compareCommentsNewestFirst);
  const commentNodes = sortedComments.map(comment => commentNode(comment, commentBudget));

  return builder.build({
    issue_llm_export: {
      '@_generatedAt': toIsoString(generatedAt),
      '@_format': 'sigmatodo2.issue.llm.xml',
      '@_version': '1',
      limits: {
        commentText: {
          perFieldChars: COMMENT_FIELD_CHAR_LIMIT,
          totalChars: COMMENT_TEXT_CHAR_BUDGET,
          usedChars: commentBudget.used,
          truncatedFields: commentBudget.truncatedCount,
        },
      },
      issue: {
        code: valueNode(issue.code),
        projectCode: valueNode(issue.projectCode),
        title: valueNode(issue.title),
        priority: valueNode(issue.priority),
        status: {
          code: valueNode(issue.status),
          definition: statusDefinition ? statusDefinitionNode(statusDefinition) : nilNode(),
        },
        assignedTo: valueNode(issue.assignedTo),
        createdBy: valueNode(issue.createdBy),
        createdOn: valueNode(issue.createdOn),
        updatedOn: valueNode(issue.updatedOn),
        dueBy: valueNode(issue.dueBy),
        commentCount: issue.commentCount,
        description: {
          markdown: valueNode(issue.markdownDescription),
          renderedHtml: valueNode(issue.renderedMarkdownDescription ?? null),
        },
        assignee: userNode(issue.assignee, issue.assignedTo),
        creator: userNode(issue.creator, issue.createdBy),
      },
      project: project ? projectNode(project) : nilNode(),
      members: {
        '@_count': members.length,
        member: members.map(memberNode),
      },
      attachments: {
        '@_count': attachments.length,
        attachment: attachments.map(attachment => attachmentNode(attachment, getAttachmentUrl)),
      },
      comments: {
        '@_count': comments.length,
        '@_included': commentNodes.length,
        '@_sort': 'postedOn desc, id asc',
        comment: commentNodes,
      },
    },
  });
}

function compareCommentsNewestFirst(a: Comment, b: Comment): number {
  const postedDiff = Date.parse(b.postedOn) - Date.parse(a.postedOn);
  if (postedDiff !== 0) return postedDiff;
  return a.id.localeCompare(b.id);
}

function commentNode(comment: Comment, budget: CommentTextBudget) {
  return {
    '@_id': comment.id,
    id: valueNode(comment.id),
    issueCode: valueNode(comment.issueCode),
    postedBy: valueNode(comment.postedBy),
    postedOn: valueNode(comment.postedOn),
    editedOn: valueNode(comment.editedOn),
    author: userNode(comment.author ?? null, comment.postedBy),
    content: limitedTextNode(comment.content, budget),
    ...(comment.renderedContent != null
      ? { renderedContent: limitedTextNode(comment.renderedContent, budget) }
      : {}),
  };
}

function limitedTextNode(value: string, budget: CommentTextBudget): TextNode {
  const chars = Array.from(value);
  const originalLength = chars.length;
  const allowedLength = Math.min(COMMENT_FIELD_CHAR_LIMIT, budget.remaining);
  const includedChars = chars.slice(0, allowedLength);
  const includedLength = includedChars.length;
  const truncated = includedLength < originalLength;

  budget.remaining -= includedLength;
  budget.used += includedLength;
  if (truncated) budget.truncatedCount += 1;

  return {
    ...(truncated
      ? {
        '@_truncated': 'true' as const,
        '@_originalLength': originalLength,
        '@_includedLength': includedLength,
      }
      : {}),
    '#text': includedChars.join(''),
  };
}

function projectNode(project: ProjectWithPermissions) {
  return {
    code: valueNode(project.code),
    createdOn: valueNode(project.createdOn),
    name: valueNode(project.name),
    backgroundImgPath: valueNode(project.backgroundImgPath),
    description: valueNode(project.description),
    myPermissions: project.myPermissions ? permissionsNode(project.myPermissions) : nilNode(),
    statusDefinitions: {
      '@_count': project.statusDefinitions.length,
      status: project.statusDefinitions.map(statusDefinitionNode),
    },
  };
}

function memberNode(member: ProjectUser) {
  return {
    '@_userHandle': member.userHandle,
    userHandle: valueNode(member.userHandle),
    projectCode: valueNode(member.projectCode),
    permissions: permissionsNode(member.permissions),
    user: userNode(member.user ?? null, member.userHandle),
  };
}

function attachmentNode(
  attachment: Attachment,
  getAttachmentUrl: (attachment: Attachment) => string,
) {
  return {
    '@_id': attachment.id,
    id: valueNode(attachment.id),
    projectCode: valueNode(attachment.projectCode),
    issueCode: valueNode(attachment.issueCode),
    filename: valueNode(attachment.filename),
    mimeType: valueNode(attachment.mimeType),
    uploadedOn: valueNode(attachment.uploadedOn),
    url: valueNode(getAttachmentUrl(attachment)),
  };
}

function statusDefinitionNode(status: StatusDefinition) {
  return {
    code: valueNode(status.code),
    name: valueNode(status.name),
    bgColor: valueNode(status.bgColor),
    importanceLevel: status.importanceLevel,
    isActive: status.isActive,
  };
}

function userNode(user: User | null | undefined, fallbackHandle: string | null | undefined) {
  return {
    handle: valueNode(user?.handle ?? fallbackHandle ?? null),
    createdOn: valueNode(user?.createdOn ?? null),
    displayName: valueNode(user?.displayName ?? null),
    avatarPath: valueNode(user?.avatarPath ?? null),
    bio: valueNode(user?.bio ?? null),
    email: valueNode(user?.email ?? null),
  };
}

function permissionsNode(permissions: PermissionsMap) {
  return {
    viewIssues: permissions.viewIssues,
    editIssues: permissions.editIssues,
    changeProjectSettings: permissions.changeProjectSettings,
  };
}

function valueNode(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return nilNode();
  return { '#text': String(value) };
}

function nilNode() {
  return { '@_nil': 'true' };
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
