const express = require('express');
const router = express.Router();
require('dotenv').config();
const { checkToken } = require('../functions/middlewares');


const {
    pre_create_pending_justify
} = require('../functions/postgresFunctions');

router.post('/justify_pending', async (req, res) => {
    try {
        if (!checkToken(req, res)) return;

        const { autor, estado, quantidade, tipo, unidade_leitura, instalacao, foto } = req.body;

        if (!autor || !estado) {
            return res.status(400).json({ error: 'Autor e estado são obrigatórios' });
        }
        if (!quantidade || quantidade < 1) {
            return res.status(400).json({ error: 'Quantidade é obrigatória' });
        }

        const result = await pre_create_pending_justify({
            state: estado,
            autor,
            quantidade,
            tipo,
            unidade_leitura,
            instalacao,
            foto
        });

        res.status(201).json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;