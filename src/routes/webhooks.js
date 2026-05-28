const express = require('express');
const router = express.Router();
const { sendMessageWhatsappFile } = require('../functions/requestsFunctions');

const { checkToken } = require('../functions/middlewares');

router.post('/webhook_perdas', async (req, res) => {
    if (!checkToken(req, res)) return;
    const body = req.body;
    console.log(body);

    if (body.event === 'service.completed') {
        const imageUrl = Object.values(body.data.completionData)[0];
        const result = await sendMessageWhatsappFile(
            process.env.WHATSAPP_NUMBER_PERDAS,
            `Perda Recuperada: \\nIN:${body.data.title} \\nDESCRIÇÃO: \\n${body.data.description.replace(/\n/g, '\\n')}`,
            imageUrl
        );
        return res.json(result);
    }
    res.json({ error: 'Evento inválido' });
});

module.exports = router;
