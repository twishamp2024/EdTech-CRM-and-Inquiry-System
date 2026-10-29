import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: 'Email is required', abort: true })
    .pipe(z.email({ error: 'Enter a valid email address' })),
  // Not trimmed: spaces can be part of a password.
  password: z
    .string()
    .min(1, { error: 'Password is required', abort: true })
    .max(1024, { error: 'Password must be at most 1024 characters' }),
});
