const z = require('zod');

const inventorySchema = z.object({
  id: z.number().int().optional(),
  agente: z.string().min(1).max(50).transform(v => v.toLowerCase()),
  pda_imei_1: z.string().max(100).nullable().optional(),
  pda_imei_2: z.string().max(100).nullable().optional(),
  pda_numero_serie: z.string().max(100).nullable().optional(),
  pda_marca: z.string().max(100).nullable().optional(),
  pda_modelo: z.string().max(100).nullable().optional(),
  pda_numero_chip: z.string().max(100).nullable().optional(),
  pda_versao_android: z.string().max(50).nullable().optional(),
  pda_versao_bluetooth: z.string().max(50).nullable().optional(),
  impressora_numero_serie: z.string().max(100).nullable().optional(),
  impressora_modelo: z.string().max(100).nullable().optional(),
  impressora_marca: z.string().max(100).nullable().optional(),
  maquininha_numero_serie: z.string().max(100).nullable().optional(),
  maquininha_numero_logico: z.string().max(100).nullable().optional(),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

const inventoryCreateSchema = inventorySchema;
const inventoryUpdateSchema = inventorySchema.partial();

module.exports = {
  inventorySchema,
  inventoryCreateSchema,
  inventoryUpdateSchema
};
