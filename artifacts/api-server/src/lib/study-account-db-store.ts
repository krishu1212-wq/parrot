import { and, eq, sql } from "drizzle-orm";
import { db, studyAccountStatesTable } from "@workspace/db";
import type { StudyAccountRow, StudyAccountStore } from "./study-account-state";

const returningAccount = {
  state: studyAccountStatesTable.state,
  revision: studyAccountStatesTable.revision,
  updatedAt: studyAccountStatesTable.updatedAt,
};

export const studyAccountDbStore: StudyAccountStore = {
  async get(ownerId): Promise<StudyAccountRow | null> {
    const [row] = await db
      .select(returningAccount)
      .from(studyAccountStatesTable)
      .where(eq(studyAccountStatesTable.clerkUserId, ownerId))
      .limit(1);
    return row ?? null;
  },

  async createIfMissing(ownerId, state): Promise<StudyAccountRow | null> {
    const [row] = await db
      .insert(studyAccountStatesTable)
      .values({ clerkUserId: ownerId, state, revision: 1 })
      .onConflictDoNothing({ target: studyAccountStatesTable.clerkUserId })
      .returning(returningAccount);
    return row ?? null;
  },

  async replaceAtRevision(ownerId, expectedRevision, state): Promise<StudyAccountRow | null> {
    const [row] = await db
      .update(studyAccountStatesTable)
      .set({
        state,
        revision: sql`${studyAccountStatesTable.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(
        eq(studyAccountStatesTable.clerkUserId, ownerId),
        eq(studyAccountStatesTable.revision, expectedRevision),
      ))
      .returning(returningAccount);
    return row ?? null;
  },
};