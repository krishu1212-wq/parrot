import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, studyAccountStatesTable, studyProfileCredentialsTable } from "@workspace/db";
import type { ProfileSettings, StudyProfileCredential } from "@workspace/db";
import { isBoundedStudyState } from "./study-account-state";

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  soundEnabled: false,
  soundVolume: 0.5,
  hapticsEnabled: true,
  motion: "full",
  notificationsEnabled: true,
  appearance: "system",
};

const ACCOUNT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type ProfilePublicData = {
  profileId: string;
  accountCode: string;
  displayName: string;
  settings: ProfileSettings;
};

function makeAccountCode(): string {
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (byte) => ACCOUNT_CODE_ALPHABET[byte & 31]).join("");
  return `ARISE-${code.slice(0, 4)}-${code.slice(4)}`;
}

function normalizeAccountCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function recoveryDigest(salt: string, recoveryKey: string): Buffer {
  return createHash("sha256").update(salt).update(":").update(recoveryKey).digest();
}

function safeProfileData(profile: StudyProfileCredential): ProfilePublicData {
  return {
    profileId: profile.profileId,
    accountCode: profile.accountCode,
    displayName: profile.displayName,
    settings: profile.settings,
  };
}

export function isFreshProfileState(value: unknown): value is Record<string, unknown> {
  if (!isBoundedStudyState(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.totalXp !== 0 || state.streak !== 0) return false;
  if (state.recoveryAvailable !== false || state.recoveryXp !== 0
    || state.ncertCompleted !== 0 || state.blackBookPage !== 0
    || state.vocabularyDailyCompleted !== false) return false;
  if (!Array.isArray(state.quests) || state.quests.some((quest) => (
    !quest || typeof quest !== "object" || (quest as Record<string, unknown>).completed !== false
  ))) return false;
  if (!Array.isArray(state.calculationHistory) || state.calculationHistory.length !== 0) return false;
  if (!Array.isArray(state.ncertShelves) || state.ncertShelves.some((shelf) => {
    if (!shelf || typeof shelf !== "object") return true;
    const item = shelf as Record<string, unknown>;
    return item.completed !== 0 || item.sessions !== 0 || item.vocabulary !== 0;
  })) return false;
  if (!Array.isArray(state.ncertBooks) || state.ncertBooks.some((book) => (
    !book || typeof book !== "object" || (book as Record<string, unknown>).completedSessions !== 0
  ))) return false;
  if (!Array.isArray(state.vocabularySections) || state.vocabularySections.some((section) => (
    !section || typeof section !== "object" || (section as Record<string, unknown>).completed !== 0
  ))) return false;
  if (!Array.isArray(state.batches)) return false;
  for (const batch of state.batches) {
    if (!batch || typeof batch !== "object") return false;
    const subjects = (batch as Record<string, unknown>).subjects;
    if (!Array.isArray(subjects)) return false;
    for (const subject of subjects) {
      if (!subject || typeof subject !== "object") return false;
      const topics = (subject as Record<string, unknown>).topics;
      if (!Array.isArray(topics)) return false;
      for (const topic of topics) {
        if (!topic || typeof topic !== "object") return false;
        const topicRecord = topic as Record<string, unknown>;
        if ((topicRecord.completed !== undefined && topicRecord.completed !== 0)
          || topicRecord.isCompleted === true || topicRecord.status === "completed") return false;
        const lectures = topicRecord.lectures;
        if (!Array.isArray(lectures) || lectures.some((lecture) => (
          !lecture || typeof lecture !== "object"
          || (lecture as Record<string, unknown>).status === "completed"
          || (lecture as Record<string, unknown>).xpAwarded === true
        ))) return false;
      }
    }
  }
  const rpg = state.rpg;
  if (!rpg || typeof rpg !== "object") return false;
  const rpgState = rpg as Record<string, unknown>;
  if (!Array.isArray(rpgState.attempts) || rpgState.attempts.length !== 0
    || rpgState.activeAttemptId !== null
    || !Array.isArray(rpgState.events) || rpgState.events.length !== 0
    || !Array.isArray(rpgState.acquisitions) || rpgState.acquisitions.length !== 0
    || !Array.isArray(rpgState.presentationQueue) || rpgState.presentationQueue.length !== 0
    || !Array.isArray(rpgState.claimedRewardKeys) || rpgState.claimedRewardKeys.length !== 0
    || !rpgState.inventory || typeof rpgState.inventory !== "object"
    || Object.keys(rpgState.inventory as object).length !== 0
    || !rpgState.loadout || typeof rpgState.loadout !== "object"
    || Object.values(rpgState.loadout as Record<string, unknown>).some((item) => item !== null)
    || !rpgState.gates || typeof rpgState.gates !== "object"
    || Object.values(rpgState.gates as Record<string, unknown>).some((gate) => (
      !gate || typeof gate !== "object" || (gate as Record<string, unknown>).completed !== false
    ))) return false;
  const achievements = state.achievementHistory;
  if (!achievements || typeof achievements !== "object"
    || !Array.isArray((achievements as Record<string, unknown>).earnedRelicIds)
    || ((achievements as Record<string, unknown>).earnedRelicIds as unknown[]).length !== 0
    || (achievements as Record<string, unknown>).highestObservedStreak !== 0) return false;
  const tools = state.studyTools;
  if (!tools || typeof tools !== "object") return false;
  const toolData = tools as Record<string, unknown>;
  if (!["reviewCards", "bossTests", "workoutSessions", "revisionHistory", "experiments"]
    .every((key) => Array.isArray(toolData[key]) && (toolData[key] as unknown[]).length === 0)) return false;
  const history = state.progressHistory;
  if (!history || typeof history !== "object") return false;
  const progress = history as Record<string, unknown>;
  if (!Array.isArray(progress.xpEvents) || progress.xpEvents.length !== 0
    || !Array.isArray(progress.systemEvents) || progress.systemEvents.length !== 0
    || !progress.dailyObservations || typeof progress.dailyObservations !== "object"
    || Object.keys(progress.dailyObservations as object).length !== 0) return false;
  return true;
}

export async function createStudyProfile(
  state: unknown,
  displayName: string,
): Promise<{ profile: ProfilePublicData; recoveryKey: string }> {
  if (!isFreshProfileState(state)) {
    throw new Error("A new profile must start with the clean ARISE defaults.");
  }
  const cleanName = displayName.trim().slice(0, 48) || "ARISE Player";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const profileId = `arise_${randomUUID()}`;
    const accountCode = makeAccountCode();
    const recoveryKey = randomBytes(32).toString("base64url");
    const recoveryKeySalt = randomBytes(16).toString("base64url");
    const recoveryKeyHash = recoveryDigest(recoveryKeySalt, recoveryKey).toString("base64url");
    try {
      const profile = await db.transaction(async (transaction) => {
        const [inserted] = await transaction
          .insert(studyProfileCredentialsTable)
          .values({
            profileId,
            accountCode,
            recoveryKeySalt,
            recoveryKeyHash,
            displayName: cleanName,
            settings: { ...DEFAULT_PROFILE_SETTINGS },
          })
          .onConflictDoNothing({ target: studyProfileCredentialsTable.accountCode })
          .returning();
        if (!inserted) return null;
        await transaction.insert(studyAccountStatesTable).values({
          clerkUserId: profileId,
          state: state as Record<string, unknown>,
          revision: 1,
        });
        return inserted;
      });
      if (profile) return { profile: safeProfileData(profile), recoveryKey };
    } catch (error) {
      if (attempt === 5) throw error;
    }
  }
  throw new Error("A unique ARISE account code could not be generated.");
}

export async function prepareStudyProfileRestore(
  accountCode: string,
  recoveryKey: string,
): Promise<StudyProfileCredential | null> {
  const normalized = normalizeAccountCode(accountCode);
  if (!/^ARISE[23456789A-HJ-NP-Z]{8}$/.test(normalized)) return null;
  const [profile] = await db
    .select()
    .from(studyProfileCredentialsTable)
    .where(eq(studyProfileCredentialsTable.accountCode, `ARISE-${normalized.slice(5, 9)}-${normalized.slice(9)}`))
    .limit(1);
  if (!profile || recoveryKey.length < 32 || recoveryKey.length > 128) return null;
  const expected = Buffer.from(profile.recoveryKeyHash, "base64url");
  const received = recoveryDigest(profile.recoveryKeySalt, recoveryKey);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return profile;
}

export async function getStudyProfile(profileId: string): Promise<ProfilePublicData | null> {
  const [profile] = await db
    .select()
    .from(studyProfileCredentialsTable)
    .where(eq(studyProfileCredentialsTable.profileId, profileId))
    .limit(1);
  return profile ? safeProfileData(profile) : null;
}

export async function updateStudyProfile(
  profileId: string,
  input: { displayName?: string; settings?: ProfileSettings },
): Promise<ProfilePublicData | null> {
  const changes: {
    displayName?: string;
    settings?: ProfileSettings;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.displayName !== undefined) changes.displayName = input.displayName.trim().slice(0, 48) || "ARISE Player";
  if (input.settings !== undefined) changes.settings = input.settings;
  const [profile] = await db
    .update(studyProfileCredentialsTable)
    .set(changes)
    .where(and(eq(studyProfileCredentialsTable.profileId, profileId)))
    .returning();
  return profile ? safeProfileData(profile) : null;
}