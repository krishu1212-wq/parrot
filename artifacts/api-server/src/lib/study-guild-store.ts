import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  studyAccountStatesTable,
  studyGuildAchievementsTable,
  studyGuildMembershipsTable,
  studyGuildSubmissionsTable,
  studyGuildsTable,
  studyProfileCredentialsTable,
} from "@workspace/db";
import { findEligibleGuildStudyEvent, getEligibleGuildStudyEvents, getTournamentDate, GUILD_ACHIEVEMENT_KIND, GUILD_ACHIEVEMENT_TITLE, GUILD_MAX_SUBMISSIONS_PER_TOURNAMENT, GUILD_MEMBER_LIMIT, isTournamentSunday } from "./study-guild-domain";

export class StudyGuildStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "StudyGuildStoreError";
  }
}

type GuildSummary = {
  id: number;
  name: string;
  description: string;
  joinCode: string;
  memberCount: number;
  role: "leader" | "member";
  tournamentDate: Date;
  createdAt: Date;
};

const tournamentDateValue = (date: string) => new Date(`${date}T00:00:00.000Z`);
const summary = (
  guild: typeof studyGuildsTable.$inferSelect,
  role: "leader" | "member",
  tournamentDate = getTournamentDate(),
): GuildSummary => ({
  id: guild.id,
  name: guild.name,
  description: guild.description,
  joinCode: guild.joinCode,
  memberCount: guild.memberCount,
  role,
  tournamentDate: tournamentDateValue(tournamentDate),
  createdAt: guild.createdAt,
});

function publicName(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 48) : "ARISE Member";
}

function generatedJoinCode(): string {
  return `ARISE-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function serviceError(status: number, message: string): never {
  throw new StudyGuildStoreError(status, message);
}

export async function createStudyGuild(ownerId: string, input: { name: string; description?: string }): Promise<GuildSummary> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description?.trim() ?? "";
  if (name.length < 3 || name.length > 36 || description.length > 160) {
    serviceError(400, "Guild details are invalid.");
  }

  return db.transaction(async (tx) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [guild] = await tx
        .insert(studyGuildsTable)
        .values({
          name,
          description,
          joinCode: generatedJoinCode(),
          createdBy: ownerId,
          memberCount: 1,
        })
        .onConflictDoNothing({ target: studyGuildsTable.joinCode })
        .returning();
      if (!guild) continue;
      await tx.insert(studyGuildMembershipsTable).values({
        guildId: guild.id,
        profileId: ownerId,
        role: "leader",
      });
      return summary(guild, "leader");
    }
    throw new Error("A unique Guild join code could not be generated.");
  });
}

export async function listStudyGuilds(ownerId: string): Promise<{ guilds: GuildSummary[] }> {
  const rows = await db
    .select({ guild: studyGuildsTable, role: studyGuildMembershipsTable.role })
    .from(studyGuildMembershipsTable)
    .innerJoin(studyGuildsTable, eq(studyGuildMembershipsTable.guildId, studyGuildsTable.id))
    .where(and(
      eq(studyGuildMembershipsTable.profileId, ownerId),
      isNull(studyGuildMembershipsTable.leftAt),
      eq(studyGuildsTable.status, "active"),
    ))
    .orderBy(desc(studyGuildsTable.createdAt))
    .limit(100);
  return {
    guilds: rows.map(({ guild, role }) => summary(guild, role === "leader" ? "leader" : "member")),
  };
}

export async function joinStudyGuild(ownerId: string, joinCode: string): Promise<GuildSummary> {
  const normalizedCode = joinCode.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^ARISE-[A-F0-9]{10}$/.test(normalizedCode)) {
    serviceError(400, "Guild code is invalid.");
  }

  return db.transaction(async (tx) => {
    const [guild] = await tx
      .select()
      .from(studyGuildsTable)
      .where(and(eq(studyGuildsTable.joinCode, normalizedCode), eq(studyGuildsTable.status, "active")))
      .for("update")
      .limit(1);
    if (!guild) serviceError(404, "No active Guild matches this code.");

    const [existing] = await tx
      .select()
      .from(studyGuildMembershipsTable)
      .where(and(
        eq(studyGuildMembershipsTable.guildId, guild.id),
        eq(studyGuildMembershipsTable.profileId, ownerId),
        isNull(studyGuildMembershipsTable.leftAt),
      ))
      .limit(1);
    if (existing) return summary(guild, existing.role === "leader" ? "leader" : "member");

    const [countRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(studyGuildMembershipsTable)
      .where(and(
        eq(studyGuildMembershipsTable.guildId, guild.id),
        isNull(studyGuildMembershipsTable.leftAt),
      ));
    const activeCount = Number(countRow?.value ?? 0);
    if (activeCount >= GUILD_MEMBER_LIMIT) serviceError(409, "This Guild already has 12 active members.");

    await tx.insert(studyGuildMembershipsTable).values({
      guildId: guild.id,
      profileId: ownerId,
      role: "member",
    });
    const [updatedGuild] = await tx
      .update(studyGuildsTable)
      .set({ memberCount: activeCount + 1 })
      .where(eq(studyGuildsTable.id, guild.id))
      .returning();
    if (!updatedGuild) throw new Error("The Guild could not be updated after joining.");
    return summary(updatedGuild, "member");
  });
}

function responseSubmission(
  row: typeof studyGuildSubmissionsTable.$inferSelect,
  displayName: string,
  isMine: boolean,
) {
  return {
    id: row.id,
    displayName: publicName(displayName),
    eventType: row.eventType,
    tournamentDate: tournamentDateValue(row.tournamentDate),
    evidenceNote: row.evidenceNote,
    status: row.status as "pending" | "approved" | "rejected",
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    isMine,
  };
}

export async function getStudyGuild(ownerId: string, guildId: number) {
  const [guild] = await db
    .select()
    .from(studyGuildsTable)
    .where(and(eq(studyGuildsTable.id, guildId), eq(studyGuildsTable.status, "active")))
    .limit(1);
  if (!guild) serviceError(404, "Guild was not found.");

  const [membership] = await db
    .select()
    .from(studyGuildMembershipsTable)
    .where(and(
      eq(studyGuildMembershipsTable.guildId, guildId),
      eq(studyGuildMembershipsTable.profileId, ownerId),
      isNull(studyGuildMembershipsTable.leftAt),
    ))
    .limit(1);
  if (!membership) serviceError(403, "The profile is not an active Guild member.");

  const tournamentDate = getTournamentDate();
  const scoreRows = await db
    .select({
      profileId: studyGuildSubmissionsTable.profileId,
      points: sql<number>`count(*)::int`,
    })
    .from(studyGuildSubmissionsTable)
    .where(and(
      eq(studyGuildSubmissionsTable.guildId, guildId),
      eq(studyGuildSubmissionsTable.tournamentDate, tournamentDate),
      eq(studyGuildSubmissionsTable.status, "approved"),
    ))
    .groupBy(studyGuildSubmissionsTable.profileId);
  const pointsByProfile = new Map(scoreRows.map((row) => [row.profileId, Number(row.points)]));

  const memberRows = await db
    .select({
      profileId: studyGuildMembershipsTable.profileId,
      role: studyGuildMembershipsTable.role,
      joinedAt: studyGuildMembershipsTable.joinedAt,
      displayName: studyProfileCredentialsTable.displayName,
    })
    .from(studyGuildMembershipsTable)
    .leftJoin(
      studyProfileCredentialsTable,
      eq(studyGuildMembershipsTable.profileId, studyProfileCredentialsTable.profileId),
    )
    .where(and(
      eq(studyGuildMembershipsTable.guildId, guildId),
      isNull(studyGuildMembershipsTable.leftAt),
    ))
    .orderBy(asc(studyGuildMembershipsTable.joinedAt))
    .limit(GUILD_MEMBER_LIMIT);

  const members = memberRows.map((row) => ({
    displayName: publicName(row.displayName),
    role: row.role === "leader" ? "leader" as const : "member" as const,
    joinedAt: row.joinedAt,
    points: pointsByProfile.get(row.profileId) ?? 0,
    isYou: row.profileId === ownerId,
  }));
  const leaderboard = [...members].sort((a, b) =>
    b.points - a.points || a.joinedAt.getTime() - b.joinedAt.getTime(),
  );

  const ownSubmissionRows = await db
    .select({ submission: studyGuildSubmissionsTable, displayName: studyProfileCredentialsTable.displayName })
    .from(studyGuildSubmissionsTable)
    .leftJoin(
      studyProfileCredentialsTable,
      eq(studyGuildSubmissionsTable.profileId, studyProfileCredentialsTable.profileId),
    )
    .where(and(
      eq(studyGuildSubmissionsTable.guildId, guildId),
      eq(studyGuildSubmissionsTable.profileId, ownerId),
      eq(studyGuildSubmissionsTable.tournamentDate, tournamentDate),
    ))
    .orderBy(desc(studyGuildSubmissionsTable.submittedAt))
    .limit(10);
  const mySubmissions = ownSubmissionRows.map((row) =>
    responseSubmission(row.submission, row.displayName ?? "", true));

  let pendingReviews: {
    submissionId: number;
    displayName: string;
    eventType: string;
    tournamentDate: Date;
    evidenceNote: string | null;
    submittedAt: Date;
  }[] = [];
  if (membership.role === "leader") {
    const pendingRows = await db
      .select({
        submission: studyGuildSubmissionsTable,
        displayName: studyProfileCredentialsTable.displayName,
      })
      .from(studyGuildSubmissionsTable)
      .leftJoin(
        studyProfileCredentialsTable,
        eq(studyGuildSubmissionsTable.profileId, studyProfileCredentialsTable.profileId),
      )
      .where(and(
        eq(studyGuildSubmissionsTable.guildId, guildId),
        eq(studyGuildSubmissionsTable.status, "pending"),
        ne(studyGuildSubmissionsTable.profileId, ownerId),
      ))
      .orderBy(asc(studyGuildSubmissionsTable.submittedAt))
      .limit(50);
    pendingReviews = pendingRows.map(({ submission, displayName }) => ({
      submissionId: submission.id,
      displayName: publicName(displayName),
      eventType: submission.eventType,
      tournamentDate: tournamentDateValue(submission.tournamentDate),
      evidenceNote: submission.evidenceNote,
      submittedAt: submission.submittedAt,
    }));
  }

  const [account] = await db
    .select({ state: studyAccountStatesTable.state })
    .from(studyAccountStatesTable)
    .where(eq(studyAccountStatesTable.clerkUserId, ownerId))
    .limit(1);
  const submittedEventIds = new Set(ownSubmissionRows.map((row) => row.submission.studyEventId));
  const eligibleEvents = getEligibleGuildStudyEvents(account?.state, tournamentDate)
    .filter((event) => !submittedEventIds.has(event.id))
    .map((event) => ({
    id: event.id,
    eventType: event.eventType,
    eventDate: tournamentDateValue(event.eventDate),
    occurredAt: new Date(event.occurredAt),
    }));

  const achievementRows = await db
    .select()
    .from(studyGuildAchievementsTable)
    .where(eq(studyGuildAchievementsTable.guildId, guildId))
    .orderBy(desc(studyGuildAchievementsTable.awardedAt))
    .limit(100);
  const achievements = achievementRows.map((award) => ({
    kind: "three-contributors" as const,
    title: GUILD_ACHIEVEMENT_TITLE,
    tournamentDate: tournamentDateValue(award.tournamentDate),
    awardedAt: award.awardedAt,
  }));

  return {
    guild: summary(guild, membership.role === "leader" ? "leader" : "member", tournamentDate),
    members,
    leaderboard,
    eligibleEvents,
    mySubmissions,
    pendingReviews,
    achievements,
  };
}

export async function submitStudyGuildEvidence(
  ownerId: string,
  guildId: number,
  input: { studyEventId: string; evidenceNote?: string },
) {
  const now = new Date();
  if (!isTournamentSunday(now)) {
    serviceError(400, "Tournament submissions are open on Sunday in India Standard Time.");
  }
  const tournamentDate = getTournamentDate(now);
  const note = input.evidenceNote?.trim() || null;

  return db.transaction(async (tx) => {
    const [guild] = await tx
      .select()
      .from(studyGuildsTable)
      .where(and(eq(studyGuildsTable.id, guildId), eq(studyGuildsTable.status, "active")))
      .for("update")
      .limit(1);
    if (!guild) serviceError(404, "Guild was not found.");
    const [membership] = await tx
      .select()
      .from(studyGuildMembershipsTable)
      .where(and(
        eq(studyGuildMembershipsTable.guildId, guildId),
        eq(studyGuildMembershipsTable.profileId, ownerId),
        isNull(studyGuildMembershipsTable.leftAt),
      ))
      .limit(1);
    if (!membership) serviceError(403, "The profile is not an active Guild member.");

    const submissions = await tx
      .select({
        id: studyGuildSubmissionsTable.id,
        studyEventId: studyGuildSubmissionsTable.studyEventId,
      })
      .from(studyGuildSubmissionsTable)
      .where(and(
        eq(studyGuildSubmissionsTable.guildId, guildId),
        eq(studyGuildSubmissionsTable.profileId, ownerId),
        eq(studyGuildSubmissionsTable.tournamentDate, tournamentDate),
      ));
    if (submissions.length >= GUILD_MAX_SUBMISSIONS_PER_TOURNAMENT) {
      serviceError(409, `A member can submit up to ${GUILD_MAX_SUBMISSIONS_PER_TOURNAMENT} saved study events per Sunday.`);
    }

    const [account] = await tx
      .select({ state: studyAccountStatesTable.state })
      .from(studyAccountStatesTable)
      .where(eq(studyAccountStatesTable.clerkUserId, ownerId))
      .limit(1);
    const event = findEligibleGuildStudyEvent(account?.state, input.studyEventId, tournamentDate);
    if (!event) serviceError(400, "Choose a saved study event recorded on this Sunday.");
    if (submissions.some((submission) => submission.studyEventId === event.id)) {
      serviceError(409, "This saved study event has already been submitted.");
    }

    const [submission] = await tx
      .insert(studyGuildSubmissionsTable)
      .values({
        guildId,
        profileId: ownerId,
        studyEventId: event.id,
        eventType: event.eventType,
        eventTimestamp: new Date(event.occurredAt),
        tournamentDate,
        evidenceNote: note,
        status: "pending",
      })
      .returning();
    if (!submission) throw new Error("Guild evidence could not be saved.");
    const [profile] = await tx
      .select({ displayName: studyProfileCredentialsTable.displayName })
      .from(studyProfileCredentialsTable)
      .where(eq(studyProfileCredentialsTable.profileId, ownerId))
      .limit(1);
    return responseSubmission(submission, profile?.displayName ?? "", true);
  });
}

export async function reviewStudyGuildEvidence(
  reviewerId: string,
  guildId: number,
  submissionId: number,
  decision: "approved" | "rejected",
) {
  return db.transaction(async (tx) => {
    const [guild] = await tx
      .select()
      .from(studyGuildsTable)
      .where(and(eq(studyGuildsTable.id, guildId), eq(studyGuildsTable.status, "active")))
      .for("update")
      .limit(1);
    if (!guild) serviceError(404, "Guild was not found.");

    const [membership] = await tx
      .select()
      .from(studyGuildMembershipsTable)
      .where(and(
        eq(studyGuildMembershipsTable.guildId, guildId),
        eq(studyGuildMembershipsTable.profileId, reviewerId),
        isNull(studyGuildMembershipsTable.leftAt),
      ))
      .limit(1);
    if (!membership) serviceError(403, "The profile is not an active Guild member.");
    if (membership.role !== "leader") serviceError(403, "Only the Guild leader can review evidence.");

    const [submission] = await tx
      .select()
      .from(studyGuildSubmissionsTable)
      .where(and(
        eq(studyGuildSubmissionsTable.id, submissionId),
        eq(studyGuildSubmissionsTable.guildId, guildId),
      ))
      .for("update")
      .limit(1);
    if (!submission) serviceError(404, "Guild evidence was not found.");
    if (submission.profileId === reviewerId) serviceError(403, "Leaders cannot review their own evidence.");
    if (submission.status !== "pending") serviceError(409, "This evidence has already been reviewed.");

    const reviewedAt = new Date();
    const [updated] = await tx
      .update(studyGuildSubmissionsTable)
      .set({ status: decision, reviewedBy: reviewerId, reviewedAt })
      .where(and(
        eq(studyGuildSubmissionsTable.id, submissionId),
        eq(studyGuildSubmissionsTable.status, "pending"),
      ))
      .returning();
    if (!updated) serviceError(409, "This evidence has already been reviewed.");

    if (decision === "approved") {
      const [result] = await tx
        .select({ contributors: sql<number>`count(distinct ${studyGuildSubmissionsTable.profileId})::int` })
        .from(studyGuildSubmissionsTable)
        .where(and(
          eq(studyGuildSubmissionsTable.guildId, guildId),
          eq(studyGuildSubmissionsTable.tournamentDate, updated.tournamentDate),
          eq(studyGuildSubmissionsTable.status, "approved"),
        ));
      if (Number(result?.contributors ?? 0) >= 3) {
        await tx
          .insert(studyGuildAchievementsTable)
          .values({
            guildId,
            tournamentDate: updated.tournamentDate,
            kind: GUILD_ACHIEVEMENT_KIND,
          })
          .onConflictDoNothing();
      }
    }

    const [profile] = await tx
      .select({ displayName: studyProfileCredentialsTable.displayName })
      .from(studyProfileCredentialsTable)
      .where(eq(studyProfileCredentialsTable.profileId, updated.profileId))
      .limit(1);
    return responseSubmission(updated, profile?.displayName ?? "", false);
  });
}

export async function leaveStudyGuild(ownerId: string, guildId: number) {
  return db.transaction(async (tx) => {
    const [guild] = await tx
      .select()
      .from(studyGuildsTable)
      .where(eq(studyGuildsTable.id, guildId))
      .for("update")
      .limit(1);
    if (!guild) serviceError(404, "Guild was not found.");
    if (guild.status !== "active") serviceError(403, "The profile is not an active Guild member.");

    const [membership] = await tx
      .select()
      .from(studyGuildMembershipsTable)
      .where(and(
        eq(studyGuildMembershipsTable.guildId, guildId),
        eq(studyGuildMembershipsTable.profileId, ownerId),
        isNull(studyGuildMembershipsTable.leftAt),
      ))
      .for("update")
      .limit(1);
    if (!membership) serviceError(403, "The profile is not an active Guild member.");

    const [activeCountRow] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(studyGuildMembershipsTable)
      .where(and(
        eq(studyGuildMembershipsTable.guildId, guildId),
        isNull(studyGuildMembershipsTable.leftAt),
      ));
    const remainingCount = Math.max(0, Number(activeCountRow?.value ?? 0) - 1);
    await tx
      .update(studyGuildMembershipsTable)
      .set({ leftAt: new Date() })
      .where(eq(studyGuildMembershipsTable.id, membership.id));

    let closed = remainingCount === 0;
    if (membership.role === "leader" && !closed) {
      const [nextLeader] = await tx
        .select()
        .from(studyGuildMembershipsTable)
        .where(and(
          eq(studyGuildMembershipsTable.guildId, guildId),
          ne(studyGuildMembershipsTable.profileId, ownerId),
          isNull(studyGuildMembershipsTable.leftAt),
        ))
        .orderBy(asc(studyGuildMembershipsTable.joinedAt))
        .for("update")
        .limit(1);
      if (!nextLeader) throw new Error("The Guild leader could not be transferred safely.");
      await tx
        .update(studyGuildMembershipsTable)
        .set({ role: "leader" })
        .where(eq(studyGuildMembershipsTable.id, nextLeader.id));
    }

    await tx
      .update(studyGuildsTable)
      .set({
        memberCount: remainingCount,
        status: closed ? "closed" : "active",
      })
      .where(eq(studyGuildsTable.id, guildId));
    return { guildId, closed };
  });
}