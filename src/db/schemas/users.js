const { VALID_STATE_VALUES, VALID_STATE_VALUES_ALL } = require('../../constants/states');
const z = require('zod');

const passwordSchema = z.string()
  .min(8, 'A senha deve ter no mínimo 8 caracteres')
  .max(255)
  .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula')
  .regex(/[a-z]/, 'A senha deve conter pelo menos uma letra minúscula')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um número')
  .regex(/[^A-Za-z0-9]/, 'A senha deve conter pelo menos um caractere especial');

const userSchema = z.object({
  id: z.number().int().optional(),
  email: z.string().email().max(255),
  senha: passwordSchema,
  nome: z.string().min(1).max(255),
  role: z.enum(['COMPANY_ADMIN', 'USER']).default('USER'),
  estado: z.enum(VALID_STATE_VALUES_ALL).default('pi').transform(v => v.toLowerCase()),
  ultimo_login: z.date().nullable().optional(),
  ativo: z.boolean().default(true),
  foto: z.string().max(500).optional().nullable(),
  permissions: z.array(z.number().int()).optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const userDbCreateSchema = z.object({
  ...userSchema.shape,
  senha: z.string().min(1).max(255)
});
const userCreateSchema = userSchema;
const userUpdateSchema = userSchema.partial().omit({ id: true });
const userLoginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1)
});

const { normalizeAgentId, normalizeAgentName, normalizeTextUpper } = require('../../utils/agentNormalize');

const agentCreateSchema = z.object({
  id: z.string().transform(normalizeAgentId).pipe(z.string().min(1, 'Matrícula da Concessionária é obrigatória e deve conter caracteres alfanuméricos').max(255)),
  matricula: z.string().transform(normalizeAgentId).pipe(z.string().min(1, 'Matrícula Ceneged é obrigatória e deve conter caracteres alfanuméricos').max(255)),
  nome: z.string().min(1, 'Nome completo é obrigatório').max(255).transform(normalizeAgentName),
  estado: z.string().min(2).max(2),
  gestor: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  cargo: z.string().max(255).optional().nullable(),
  seccional: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  regional: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  status: z.boolean().optional(),
  situacao: z.enum(['active', 'vocation', 'inactive', 'away']).optional(),
  processo: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  is_gestor: z.boolean().optional()
});

const agentUpdateSchema = z.object({
  nome: z.string().min(1).max(255).optional().transform(val => typeof val === 'string' ? normalizeAgentName(val) : val),
  matricula: z.string().max(255).optional().nullable().transform(val => val ? normalizeAgentId(val) : val),
  gestor: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  cargo: z.string().max(255).optional().nullable(),
  seccional: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  regional: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? normalizeTextUpper(val) : val),
  estado: z.string().max(2).optional().nullable(),
  status: z.boolean().optional(),
  situacao: z.enum(['active', 'vocation', 'inactive', 'away']).optional(),
  processo: z.string().max(255).optional().nullable().transform(val => typeof val === 'string' ? (val === '__UNCHANGED__' ? '__UNCHANGED__' : normalizeTextUpper(val)) : val),
  is_gestor: z.boolean().optional()
});

module.exports = {
  userSchema,
  userDbCreateSchema,
  userCreateSchema,
  userUpdateSchema,
  userLoginSchema,
  agentCreateSchema,
  agentUpdateSchema,
  passwordSchema
};
