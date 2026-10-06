import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const studyGuildsTable = pgTable(
  "study_guilds",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 36 }).notNull(),
    description: varchar("description", { length: 160 }).notNull().default(""),
    joinCode: varchar("join_code", { length: 16 }).notNull().unique(),
    createdBy: text("created_by").notNull(),
    memberCount: integer("member_count").notNull().default(1),
    status: varchar("status", { length: 12 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("study_guilds_member_count_bounds", sql`${table.memberCount} between 0 and 12`),
    check("study_guilds_status_valid", sql`${table.status} in ('active', 'closed')`),
  ],
);

export const studyGuildMembershipsTable = pgTable(
  "study_guild_memberships",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id").notNull().references(() => studyGuildsTable.id),
    profileId: text("profile_id").notNull(),
    role: varchar("role", { length: 12 }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    check("study_guild_memberships_role_valid", sql`${table.role} in ('leader', 'member')`),
    uniqueIndex("study_guild_memberships_active_unique")
      .on(table.guildId, table.profileId)
      .where(sql`${table.leftAt} is null`),
    uniqueIndex("study_guild_memberships_one_leader")
      .on(table.guildId)
      .where(sql`${table.leftAt} is null and ${table.role} = 'leader'`),
  ],
);

export const studyGuildSubmissionsTable = pgTable(
  "study_guild_submissions",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id").notNull().references(() => studyGuildsTable.id),
    profileId: text("profile_id").notNull(),
    studyEventId: varchar("study_event_id", { length: 240 }).notNull(),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
    tournamentDate: date("tournament_date", { mode: "string" }).notNull(),
    evidenceNote: varchar("evidence_note", { length: 500 }),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    check("study_guild_submissions_status_valid", sql`${table.status} in ('pending', 'approved', 'rejected')`),
    uniqueIndex("study_guild_submissions_event_unique")
      .on(table.guildId, table.profileId, table.tournamentDate, table.studyEventId),
  ],
);

export const studyGuildAchievementsTable = pgTable(
  "study_guild_achievements",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id").notNull().references(() => studyGuildsTable.id),
    tournamentDate: date("tournament_date", { mode: "string" }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("study_guild_achievements_once")
      .on(table.guildId, table.tournamentDate, table.kind),
  ],
);

export const insertStudyGuildSchema = createInsertSchema(studyGuildsTable).omit({
  id: true,
  createdAt: true,
});
export const insertStudyGuildMembershipSchema = createInsertSchema(studyGuildMembershipsTable).omit({
  id: true,
  joinedAt: true,
});
export const insertStudyGuildSubmissionSchema = createInsertSchema(studyGuildSubmissionsTable).omit({
  id: true,
  submittedAt: true,
});
export const insertStudyGuildAchievementSchema = createInsertSchema(studyGuildAchievementsTable).omit({
  id: true,
  awardedAt: true,
});

export type InsertStudyGuild = typeof studyGuildsTable.$inferInsert;
export type StudyGuild = typeof studyGuildsTable.$inferSelect;
export type InsertStudyGuildMembership = typeof studyGuildMembershipsTable.$inferInsert;
export type StudyGuildMembership = typeof studyGuildMembershipsTable.$inferSelect;
export type InsertStudyGuildSubmission = typeof studyGuildSubmissionsTable.$inferInsert;
export type StudyGuildSubmission = typeof studyGuildSubmissionsTable.$inferSelect;
export type InsertStudyGuildAchievement = typeof studyGuildAchievementsTable.$inferInsert;
export type StudyGuildAchievement = typeof studyGuildAchievementsTable.$inferSelect;