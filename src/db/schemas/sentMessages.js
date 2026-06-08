const z = require('zod');

const sentMessageSchema = z.object({
  id: z.number().int().optional(),
  agente_id: z.string().max(50).nullable().optional(),
  operador_id: z.string().max(50).nullable().optional(),
  texto: z.string().nullable().optional(),
  arquivo: z.string().nullable().optional(),
  sucesso: z.boolean().default(true),
  resposta: z.union([z.string(), z.record(z.any())]).nullable().optional(),
  created_at: z.date().optional()
});

const sentMessageCreateSchema = sentMessageSchema.omit({ id: true });

module.exports = {
  sentMessageSchema,
  sentMessageCreateSchema
};
