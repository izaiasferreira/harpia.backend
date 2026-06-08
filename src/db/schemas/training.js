const z = require('zod');

const trainingProjectSchema = z.object({
  id: z.number().int().optional(),
  user_id: z.number().int().nullable().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  badge_id: z.number().int().nullable().optional(),
  flow_data: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const agentTrainingCompletionSchema = z.object({
  id: z.number().int().optional(),
  agent_id: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  training_project_id: z.number().int(),
  completed_at: z.date().optional()
});

const trainingChatMessageSchema = z.object({
  id: z.number().int().optional(),
  training_id: z.number().int(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  created_at: z.date().optional()
});

const trainingProjectCreateSchema = trainingProjectSchema.omit({ id: true });
const agentTrainingCompletionCreateSchema = agentTrainingCompletionSchema.omit({ id: true });

module.exports = {
  trainingProjectSchema,
  trainingProjectCreateSchema,
  agentTrainingCompletionSchema,
  agentTrainingCompletionCreateSchema,
  trainingChatMessageSchema
};
