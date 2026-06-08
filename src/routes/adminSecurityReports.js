const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const {
    get_security_reports_admin,
    create_security_report_admin,
    delete_security_report_admin
} = require('../functions/database/adminSecurityReports');

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

router.post('/', verifyToken(), verifyModule('create_security_report'), validate(require('../db/schemas/security').securityReportCreateSchema), async (req, res) => {
    try {
        const { autor, motivo, observacao, latitude, longitude, estado } = req.body;
        if (!autor || !motivo) {
            return res.status(400).json({ error: 'Autor e motivo são obrigatórios' });
        }
        
        // Se o admin não passar o estado, usamos o estado do próprio admin (ou pi se não houver)
        const targetEstado = estado || req.user.estado || 'pi';
        
        const result = await create_security_report_admin({
            autor,
            motivo,
            observacao,
            latitude,
            longitude,
            estado: targetEstado
        });
        res.status(201).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
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
