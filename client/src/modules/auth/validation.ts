import { z } from "zod";
import { passwordRules } from "../../components/ui/PasswordInput";
export const passwordSchema = z
  .string()
  .min(9, "Use at least 9 characters")
  .max(72, "Use no more than 72 characters")
  .refine(
    (v) => passwordRules.every((r) => r.check(v)),
    "Include uppercase, lowercase and a special character",
  )
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Password must fit within 72 bytes",
  );
export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(254)
  .transform((v) => v.toLowerCase());
export const authSchema = (mode: string) =>
  z.object({
    email: mode === "reset" ? z.string() : emailSchema,
    password:
      mode === "signup" || mode === "reset"
        ? passwordSchema
        : mode === "login"
          ? z.string().min(1, "Enter your password")
          : z.string(),
    name:
      mode === "signup"
        ? z.string().trim().min(1, "Enter your name").max(120)
        : z.string(),
  });
