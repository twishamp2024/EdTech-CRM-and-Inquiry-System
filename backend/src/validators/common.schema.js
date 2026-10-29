import { z } from 'zod';

/** Route parameter `:id` for resources keyed by UUID (admins, inquiries). */
export const uuidParamSchema = z.object({
  id: z.uuid({ error: 'id must be a valid UUID' }),
});
