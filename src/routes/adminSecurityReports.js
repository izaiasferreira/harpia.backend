const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const {
    get_security_reports_admin,
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
