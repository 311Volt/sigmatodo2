import { db } from '../db/index';
import { projects, projectUsers, issueSequences } from '../db/schema';
import * as projectRepo from '../repositories/projectRepo';
import { DEFAULT_STATUSES, OWNER_PERMISSIONS } from 'sigmatodo2-common';
import type { Project } from 'sigmatodo2-common';

export async function createProject(params: {
  code: string;
  name: string;
  description?: string;
  ownerHandle: string;
}): Promise<Project> {
  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      code: params.code,
      name: params.name,
      description: params.description ?? null,
      statusDefinitions: DEFAULT_STATUSES,
    });
    await tx.insert(projectUsers).values({
      userHandle: params.ownerHandle,
      projectCode: params.code,
      permissions: OWNER_PERMISSIONS,
    });
    await tx.insert(issueSequences).values({
      projectCode: params.code,
      nextNumber: 1,
    });
  });
  return projectRepo.getProjectByCode(params.code) as Promise<Project>;
}
