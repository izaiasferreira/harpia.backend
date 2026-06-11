const z = require('zod');

const resolverSchema = z.object({
  descricao_solucao: z.string().min(1, 'Descrição da solução é obrigatória'),
});

module.exports = {
  resolverSchema,
};
