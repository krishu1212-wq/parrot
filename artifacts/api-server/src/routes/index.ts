import { Router, type IRouter } from "express";
import healthRouter from "./health";
import coachRouter from "./coach";
import studyAccountRouter from "./study-account";
import studyProfileRouter from "./study-profile";
import studyGuildRouter from "./study-guilds";

const router: IRouter = Router();

router.use(healthRouter);
router.use(coachRouter);
router.use(studyAccountRouter);
router.use(studyProfileRouter);
router.use(studyGuildRouter);

export default router;
