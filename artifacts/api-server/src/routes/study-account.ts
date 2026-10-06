import { Router, type IRouter } from "express";
import {
  GetStudyAccountResponse,
  PutStudyAccountBody,
  PutStudyAccountResponse,
} from "@workspace/api-zod";
import type { AuthenticatedRequest } from "../middlewares/requireAuth";
import { requireAuth } from "../middlewares/requireAuth";
import { studyAccountDbStore } from "../lib/study-account-db-store";
import { getStudyAccount, saveStudyAccount } from "../lib/study-account-state";

const router: IRouter = Router();
const putStudyAccountBodySchema = PutStudyAccountBody.strict();

function errorType(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 80);
  }
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name.slice(0, 80);
  }
  return "UnknownError";
}

router.get("/study/account", requireAuth, async (req, res): Promise<void> => {
  try {
    const account = await getStudyAccount(
      studyAccountDbStore,
      (req as AuthenticatedRequest).verifiedOwnerId,
    );
    res.json(GetStudyAccountResponse.parse(account));
  } catch (error) {
    req.log.error({ errorType: errorType(error) }, "Study account read failed");
    res.status(503).json({
      error: "Account progress storage is temporarily unavailable.",
    });
  }
});

router.put("/study/account", requireAuth, async (req, res): Promise<void> => {
  const parsed = putStudyAccountBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "The account progress request is malformed or exceeds supported bounds.",
    });
    return;
  }

  try {
    const result = await saveStudyAccount(
      studyAccountDbStore,
      (req as AuthenticatedRequest).verifiedOwnerId,
      parsed.data,
    );
    if (result.kind === "owner-mismatch") {
      res.status(409).json({
        error: "The active account changed. Reload account progress before saving.",
      });
      return;
    }
    if (result.kind === "invalid") {
      res.status(400).json({
        error: "The study state is malformed or exceeds supported bounds.",
      });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({
        error: "Account progress changed elsewhere. Reload before saving.",
        currentRevision: result.currentRevision,
      });
      return;
    }

    res.json(PutStudyAccountResponse.parse(result.account));
  } catch (error) {
    req.log.error({ errorType: errorType(error) }, "Study account save failed");
    res.status(503).json({
      error: "Account progress storage is temporarily unavailable.",
    });
  }
});

export default router;