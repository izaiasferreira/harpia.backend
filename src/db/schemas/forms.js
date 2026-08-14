const z = require('zod');

const formSchema = z.object({
  id: z.number().int().optional(),
  user_id: z.number().int().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  cover_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  badge_id: z.number().int().nullable().optional(),
  settings: z.union([z.string(), z.record(z.any())]).optional(),
  structure: z.union([z.string(), z.array(z.any())]).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const formResponseSchema = z.object({
  id: z.number().int().optional(),
  form_id: z.number().int(),
  answers: z.union([z.string(), z.record(z.any())]).default('{}'),
  submitted_at: z.date().optional(),
  metadata: z.union([z.string(), z.record(z.any())]).default('{}')
});

const formChatMessageSchema = z.object({
  id: z.number().int().optional(),
  form_id: z.number().int(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  attachments: z.union([z.string(), z.array(z.any())]).nullable().optional(),
  created_at: z.date().optional()
});

const formCreateSchema = formSchema.omit({ id: true });
const formSubmitSchema = formResponseSchema.omit({ id: true });

module.exports = {
  formSchema,
  formCreateSchema,
  formResponseSchema,
  formSubmitSchema,
  formChatMessageSchema
};
