import { z } from "zod"

// Mirrors server-side validation (PRD F1) so users get errors before a request.

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
