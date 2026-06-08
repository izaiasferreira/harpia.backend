const z = require('zod');

const userSchema = z.object({
  id: z.number().int().optional(),
  email: z.string().email().max(255),
  senha: z.string().min(6).max(255),
  nome: z.string().min(1).max(255),
  role: z.enum(['COMPANY_ADMIN', 'USER']).default('USER'),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
  ultimo_login: z.date().nullable().optional(),
  ativo: z.boolean().default(true),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const userBranchesSchema = z.object({
  id: z.number().int().optional(),
  user_id: z.number().int(),
  branch_id: z.number().int(),
  state: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
  created_at: z.date().optional()
});

const userCreateSchema = userSchema;
const userUpdateSchema = userSchema.partial().omit({ id: true });
const userLoginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1)
});

module.exports = {
  userSchema,
  userCreateSchema,
  userUpdateSchema,
  userLoginSchema,
  userBranchesSchema
};
