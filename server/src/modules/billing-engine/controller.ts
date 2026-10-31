import type { RequestHandler } from "express";
import { runBilling } from "./service.js";
import { DomainError } from "../../lib/domain/errors.js";
import { AppError } from "../../lib/errors.js";

export const controller: RequestHandler = async (_req, res, next) => {
  try {
    res.json({ data: await runBilling(res.locals.validated.body) });
  } catch (error) {
    if (error instanceof DomainError && error.code === "INVALID_DATE")
      return next(
        new AppError(422, "VALIDATION_ERROR", error.message, {
          asOfDate: [error.message],
        }),
      );
    next(error);
  }
};
