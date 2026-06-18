const { z } = require('zod');

const accidentCreateSchema = z.object({
  tipo: z.string().min(1, 'Tipo é obrigatório'),
  descricao: z.string().nullable().optional(),
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
});

const accidentResolveSchema = z.object({
  descricao_solucao: z.string().min(1, 'Descrição da solução é obrigatória'),
  evidencias: z.array(z.object({
    nome_arquivo: z.string(),
    tipo: z.string(),
    caminho: z.string(),
  })).min(1, 'Pelo menos uma foto de evidência é obrigatória'),
});

module.exports = { accidentCreateSchema, accidentResolveSchema };
