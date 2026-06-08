const { ZodError } = require('zod');

function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            req[source] = schema.parse(req[source]);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                return res.status(400).json({
                    error: 'Dados inválidos',
                    details: err.errors.map(e => ({
                        campo: e.path.join('.'),
                        mensagem: e.message
                    }))
                });
            }
            return res.status(500).json({ error: 'Erro de validação interna' });
        }
    };
}

module.exports = { validate };
