const z = require('zod');

const branchSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50).transform(v => v.toUpperCase()),
  state: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
  parent_id: z.number().int().nullable().optional(),
  ativo: z.boolean().default(true),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const branchCreateSchema = branchSchema;

module.exports = {
  branchSchema,
  branchCreateSchema
};
