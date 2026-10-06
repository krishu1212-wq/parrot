import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type ProfileSettings = {
  soundEnabled: boolean;
  soundVolume: number;
  hapticsEnabled: boolean;
  motion: "full" | "reduced";
  notificationsEnabled: boolean;
  appearance: "system" | "dark";
};

export const studyProfileCredentialsTable = pgTable("study_profile_credentials", {
  profileId: text("profile_id").primaryKey(),
  accountCode: text("account_code").notNull().unique(),
  recoveryKeySalt: text("recovery_key_salt").notNull(),
  recoveryKeyHash: text("recovery_key_hash").notNull(),
  displayName: text("display_name").notNull(),
  settings: jsonb("settings").$type<ProfileSettings>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudyProfileCredentialSchema = createInsertSchema(studyProfileCredentialsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertStudyProfileCredential = typeof studyProfileCredentialsTable.$inferInsert;
export type StudyProfileCredential = typeof studyProfileCredentialsTable.$inferSelect;