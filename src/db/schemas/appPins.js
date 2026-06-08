const z = require('zod');

const appPinSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  pin: z.string().length(6),
  expires_at: z.date().or(z.string().transform(v => new Date(v))),
  created_at: z.date().optional(),
  used_at: z.date().nullable().optional()
});

const pinCreateSchema = appPinSchema.omit({ id: true });

module.exports = {
  appPinSchema,
  pinCreateSchema
};
