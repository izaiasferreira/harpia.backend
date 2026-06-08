const z = require('zod');

const ceneducCardSchema = z.object({
  id: z.number().int().optional(),
  card_type: z.enum(['cover', 'train_item']),
  section: z.enum(['slider', 'banner']).nullable().optional(),
  group_title: z.string().max(255).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  sort_order: z.number().int().default(0),
  active: z.boolean().default(true),
  badge_id: z.number().int().nullable().optional(),
  data: z.union([z.string(), z.record(z.any())]).default('{}'),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const ceneducCardCreateSchema = ceneducCardSchema.omit({ id: true });

module.exports = {
  ceneducCardSchema,
  ceneducCardCreateSchema
};
