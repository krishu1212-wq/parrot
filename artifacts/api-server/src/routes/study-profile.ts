import { Router, type IRouter } from "express";
import {
  ConfirmStudyProfileRestoreBody,
  ConfirmStudyProfileRestoreResponse,
  CreateStudyProfileBody,
  CreateStudyProfileResponse,
  GetStudyProfileResponse,
  PrepareStudyProfileRestoreBody,
  PrepareStudyProfileRestoreResponse,
  UpdateStudyProfileBody,
  UpdateStudyProfileResponse,
} from "@workspace/api-zod";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireAuth } from "../middlewares/requireAuth";
import { createProfileSessionToken, createRestoreCandidateToken, verifyProfileToken } from "../lib/profile-auth";
import {
  createStudyProfile,
  getStudyProfile,
  prepareStudyProfileRestore,
  updateStudyProfile,
} from "../lib/study-profile-state";

const router: IRouter = Router();

function errorType(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name.slice(0, 80);
  }
  return "UnknownError";
}

router.post("/study/profiles", async (req, res): Promise<void> => {
  const parsed = CreateStudyProfileBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "New profile details are invalid." });
    return;
  }
  try {
    const created = await createStudyProfile(parsed.data.state, parsed.data.displayName);
    const response = {
      ...created.profile,
      recoveryKey: created.recoveryKey,
      accessToken: createProfileSessionToken(created.profile.profileId),
    };
    res.status(201).json(CreateStudyProfileResponse.parse(response));
  } catch (error) {
    if (error instanceof Error && error.message === "A new profile must start with the clean ARISE defaults.") {
      res.status(400).json({ error: error.message });
      return;
    }
    req.log.error({ errorType: errorType(error) }, "Guest profile creation failed");
    res.status(503).json({ error: "Profile creation is temporarily unavailable." });
  }
});

router.post("/study/profiles/restore/prepare", async (req, res): Promise<void> => {
  const parsed = PrepareStudyProfileRestoreBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID ACCOUNT CODE" });
    return;
  }
  try {
    const profile = await prepareStudyProfileRestore(parsed.data.accountCode, parsed.data.recoveryKey);
    if (!profile) {
      res.status(400).json({ error: "INVALID ACCOUNT CODE" });
      return;
    }
    res.json(PrepareStudyProfileRestoreResponse.parse({
      candidateToken: createRestoreCandidateToken(profile.profileId),
      accountCode: profile.accountCode,
    }));
  } catch (error) {
    req.log.error({ errorType: errorType(error) }, "Profile restore preparation failed");
    res.status(503).json({ error: "Profile restore is temporarily unavailable." });
  }
});

router.post("/study/profiles/restore/confirm", async (req, res): Promise<void> => {
  const parsed = ConfirmStudyProfileRestoreBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Restore confirmation expired. Verify the code and key again." });
    return;
  }
  const profileId = verifyProfileToken(parsed.data.candidateToken, "profile-restore");
  if (!profileId) {
    res.status(400).json({ error: "Restore confirmation expired. Verify the code and key again." });
    return;
  }
  try {
    const profile = await getStudyProfile(profileId);
    if (!profile) {
      res.status(400).json({ error: "Restore confirmation expired. Verify the code and key again." });
      return;
    }
    res.json(ConfirmStudyProfileRestoreResponse.parse({
      ...profile,
      accessToken: createProfileSessionToken(profile.profileId),
    }));
  } catch (error) {
    req.log.error({ errorType: errorType(error) }, "Profile restore confirmation failed");
    res.status(503).json({ error: "Profile restore is temporarily unavailable." });
  }
});

router.get("/study/profile", requireAuth, async (req, res): Promise<void> => {
  try {
    const profile = await getStudyProfile((req as AuthenticatedRequest).verifiedOwnerId);
    if (!profile) {
      res.status(404).json({ error: "Profile was not found." });
      return;
    }
    res.json(GetStudyProfileResponse.parse(profile));
  } catch (error) {
    req.log.error({ errorType: errorType(error) }, "Profile read failed");
    res.status(503).json({ error: "Profile is temporarily unavailable." });
  }
});

router.patch("/study/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateStudyProfileBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Profile update is invalid." });
    return;
  }
  try {
    const profile = await updateStudyProfile(
      (req as AuthenticatedRequest).verifiedOwnerId,
      parsed.data,
    );
    if (!profile) {
      res.status(404).json({ error: "Profile was not found." });
      return;
    }
    res.json(UpdateStudyProfileResponse.parse(profile));
  } catch (error) {
    req.log.error({ errorType: errorType(error) }, "Profile update failed");
    res.status(503).json({ error: "Profile update is temporarily unavailable." });
  }
});

export default router;