import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateStudyGuildBody,
  CreateStudyGuildResponse,
  GetStudyGuildResponse,
  JoinStudyGuildBody,
  JoinStudyGuildResponse,
  LeaveStudyGuildResponse,
  ListStudyGuildsResponse,
  ReviewStudyGuildEvidenceBody,
  ReviewStudyGuildEvidenceResponse,
  SubmitStudyGuildEvidenceBody,
  SubmitStudyGuildEvidenceResponse,
} from "@workspace/api-zod";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireAuth } from "../middlewares/requireAuth";
import {
  createStudyGuild,
  getStudyGuild,
  joinStudyGuild,
  leaveStudyGuild,
  listStudyGuilds,
  reviewStudyGuildEvidence,
  StudyGuildStoreError,
  submitStudyGuildEvidence,
} from "../lib/study-guild-store";

const router: IRouter = Router();

function ownerId(req: Request): string {
  return (req as AuthenticatedRequest).verifiedOwnerId;
}

function errorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return null;
}

function respondError(
  req: Request,
  res: Response,
  error: unknown,
  label: string,
): void {
  if (error instanceof StudyGuildStoreError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (errorCode(error) === "23505") {
    res.status(409).json({ error: "This Guild action already exists." });
    return;
  }
  const errorType = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
  req.log.error({ errorType }, label);
  res.status(503).json({ error: "Guild services are temporarily unavailable." });
}

function parseGuildId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,8}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

router.get("/study/guilds", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(ListStudyGuildsResponse.parse(await listStudyGuilds(ownerId(req))));
  } catch (error) {
    respondError(req, res, error, "Guild list failed");
  }
});

router.post("/study/guilds", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateStudyGuildBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Guild name or description is invalid." });
    return;
  }
  try {
    res.status(201).json(CreateStudyGuildResponse.parse(await createStudyGuild(ownerId(req), parsed.data)));
  } catch (error) {
    respondError(req, res, error, "Guild creation failed");
  }
});

router.post("/study/guilds/join", requireAuth, async (req, res): Promise<void> => {
  const parsed = JoinStudyGuildBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Guild code is invalid." });
    return;
  }
  try {
    res.json(JoinStudyGuildResponse.parse(await joinStudyGuild(ownerId(req), parsed.data.joinCode)));
  } catch (error) {
    respondError(req, res, error, "Guild join failed");
  }
});

router.get("/study/guilds/:guildId", requireAuth, async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  if (!guildId) {
    res.status(400).json({ error: "Guild ID is invalid." });
    return;
  }
  try {
    res.json(GetStudyGuildResponse.parse(await getStudyGuild(ownerId(req), guildId)));
  } catch (error) {
    respondError(req, res, error, "Guild read failed");
  }
});

router.post("/study/guilds/:guildId/leave", requireAuth, async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  if (!guildId) {
    res.status(400).json({ error: "Guild ID is invalid." });
    return;
  }
  try {
    res.json(LeaveStudyGuildResponse.parse(await leaveStudyGuild(ownerId(req), guildId)));
  } catch (error) {
    respondError(req, res, error, "Guild leave failed");
  }
});

router.post("/study/guilds/:guildId/submissions", requireAuth, async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  if (!guildId) {
    res.status(400).json({ error: "Guild ID is invalid." });
    return;
  }
  const parsed = SubmitStudyGuildEvidenceBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Study evidence is invalid." });
    return;
  }
  try {
    res.status(201).json(SubmitStudyGuildEvidenceResponse.parse(
      await submitStudyGuildEvidence(ownerId(req), guildId, parsed.data),
    ));
  } catch (error) {
    respondError(req, res, error, "Guild evidence submission failed");
  }
});

router.post("/study/guilds/:guildId/submissions/:submissionId/review", requireAuth, async (req, res): Promise<void> => {
  const guildId = parseGuildId(req.params.guildId);
  const submissionId = parseGuildId(req.params.submissionId);
  if (!guildId || !submissionId) {
    res.status(400).json({ error: "Guild evidence ID is invalid." });
    return;
  }
  const parsed = ReviewStudyGuildEvidenceBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Review choice is invalid." });
    return;
  }
  try {
    res.json(ReviewStudyGuildEvidenceResponse.parse(
      await reviewStudyGuildEvidence(ownerId(req), guildId, submissionId, parsed.data.decision),
    ));
  } catch (error) {
    respondError(req, res, error, "Guild evidence review failed");
  }
});

export default router;