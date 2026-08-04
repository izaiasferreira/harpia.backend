const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const {
    get_security_reports_admin,
    delete_security_report_admin
} = require('../functions/database/adminSecurityReports');
const { create_security_report } = require('../functions/database/agentes');

router.get('/', verifyToken(), verifyModule('security_reports'), async (req, res) => {
    try {
        const { estado, page, limit, search } = req.query;
        const result = await get_security_reports_admin({
            user: req.user,
            estado,
            page,
            limit,
            search
        });
        console.log(result);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/', verifyToken(), verifyModule('create_security_report'), async (req, res) => {
    try {
        const { motivo, observacao, latitude, longitude, estado, regional, seccional, foto } = req.body;
        if (!motivo) return res.status(400).json({ error: 'Motivo do risco é obrigatório' });
        if (!estado || !regional || !seccional) {
            return res.status(400).json({ error: 'Estado, regional e seccional são obrigatórios' });
        }
        const autor = req.user.nome || req.user.id;
        const result = await create_security_report({
            autor, motivo, observacao, latitude, longitude, estado, regional, seccional, foto
        });
        res.json(result);
    } catch (error) {
        console.error('[ADMIN CREATE SECURITY REPORT]', error);
        res.status(500).json({ error: error.message || 'Erro ao criar reporte de segurança' });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_security_report'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await delete_security_report_admin(id, req.user);
        if (!result) {
            return res.status(404).json({ error: 'Relatório não encontrado' });
        }
        res.json({ success: true, deleted: result });
    } catch (error) {
        console.error(error);
        const status = error.message.includes('permissão') ? 403 : 500;
        res.status(status).json({ error: error.message });
    }
});

module.exports = router;
