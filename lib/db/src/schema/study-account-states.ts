import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const studyAccountStatesTable = pgTable(
  "study_account_states",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("study_account_states_revision_positive", sql`${table.revision} > 0`)],
);

export const insertStudyAccountStateSchema = createInsertSchema(studyAccountStatesTable).omit({
  revision: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStudyAccountState = typeof studyAccountStatesTable.$inferInsert;
export type StudyAccountState = typeof studyAccountStatesTable.$inferSelect;