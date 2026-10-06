import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "24kb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

const bodyParseErrors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({ error: "Request exceeds the server request-size limit." });
    return;
  }
  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    res.status(400).json({ error: "Request body must contain valid JSON." });
    return;
  }
  next(error);
};
app.use(bodyParseErrors);

export default app;
