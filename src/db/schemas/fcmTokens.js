const z = require('zod');

const fcmTokenSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  token: z.string().min(1),
  device_info: z.string().nullable().optional(),
  updated_at: z.date().optional()
});

const fcmTokenCreateSchema = fcmTokenSchema;

module.exports = {
  fcmTokenSchema,
  fcmTokenCreateSchema
};
