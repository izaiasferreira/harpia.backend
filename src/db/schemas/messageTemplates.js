const z = require('zod');

const messageTemplateSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(255),
  text: z.string().nullable().optional(),
  file: z.string().nullable().optional(),
  webAppButtonText: z.string().nullable().optional(),
  webAppButtonUrl: z.string().nullable().optional(),
  creator_id: z.number().int(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const messageTemplateCreateSchema = messageTemplateSchema.omit({ id: true });

module.exports = {
  messageTemplateSchema,
  messageTemplateCreateSchema
};
