import type { RequestHandler } from "express";
import { runBilling } from "./service.js";
import { DomainError } from "../../lib/domain/errors.js";
import { AppError } from "../../lib/errors.js";
import { todayBusiness } from "../../lib/dates.js";

export const controller: RequestHandler = async (_req, res, next) => {
  try {
    const input = res.locals.validated.body;
    if (input.asOfDate > todayBusiness()) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        "Billing date cannot be in the future",
        {
          asOfDate: ["Choose today or an earlier business date"],
        },
      );
    }
    res.json({ data: await runBilling(input) });
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
