const z = require('zod');

const notificationSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  sender: z.string().min(1).max(100),
  title: z.string().max(255).nullable().optional(),
  body: z.string().min(1),
  type: z.string().max(50).default('success'),
  method: z.array(z.string()).default(['push']),
  read: z.boolean().default(false),
  read_at: z.date().nullable().optional(),
  metadata: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  created_at: z.date().optional()
});

const notificationCreateSchema = notificationSchema;

module.exports = {
  notificationSchema,
  notificationCreateSchema
};
