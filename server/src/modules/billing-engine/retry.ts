import { DomainError } from "../../lib/domain/errors.js";

/** Prisma pg-adapter errors can nest PostgreSQL codes under meta/cause. */
function errorValues(
  error: unknown,
  depth = 0,
  seen = new Set<object>(),
): string[] {
  if (depth > 8 || error === null || error === undefined) return [];
  if (typeof error === "string") return [error];
  if (typeof error !== "object" || seen.has(error)) return [];
  seen.add(error);
  const object = error as Record<string, unknown>;
  return [
    "code",
    "sqlState",
    "sqlstate",
    "originalCode",
    "kind",
    "constraint",
    "constraintName",
    "target",
    "fields",
    "meta",
    "cause",
    "driverAdapterError",
  ]
    .flatMap((key) => errorValues(object[key], depth + 1, seen))
    .concat(
      Array.isArray(error)
        ? error.flatMap((value) => errorValues(value, depth + 1, seen))
        : [],
    );
}

export function isRetryableConflict(error: unknown): boolean {
  return (
    (error instanceof DomainError &&
      error.code === "DISCOUNT_RESERVATION_CONFLICT") ||
    errorValues(error).some((value) =>
      ["P2034", "40001", "40P01"].includes(value),
    )
  );
}

export function isInvoicePeriodConflict(error: unknown): boolean {
  const values = errorValues(error);
  return (
    values.some((value) => value === "P2002" || value === "23505") &&
    (values.includes("Invoice_subscriptionId_periodStart_key") ||
      (values.includes("subscriptionId") && values.includes("periodStart")))
  );
}

export async function withTransactionRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableConflict(error)) throw error;
      if (attempt >= attempts)
        throw new DomainError(
          "RETRY_LIMIT_REACHED",
          "Concurrent billing could not finish within the retry limit; retry this subscription",
        );
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          10 * 2 ** (attempt - 1) + Math.floor(Math.random() * 10),
        ),
      );
    }
  }
}
