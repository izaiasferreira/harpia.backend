const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { sinergia_pool } = require('../db');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

// Criar link de compartilhamento
router.post('/', verifyToken(), verifyModule('tracking_live'), async (req, res) => {
    try {
        const { target_agents, duration_minutes } = req.body;
        if (!target_agents || !Array.isArray(target_agents) || target_agents.length === 0) {
            return res.status(400).json({ error: 'Nenhum agente selecionado' });
        }
        if (!duration_minutes || duration_minutes <= 0) {
            return res.status(400).json({ error: 'Duração inválida' });
        }

        // Generate token
        const token = crypto.randomBytes(16).toString('hex');
        
        const expires_at = new Date();
        expires_at.setMinutes(expires_at.getMinutes() + duration_minutes);

        const query = `
            INSERT INTO tracking_shared_links (token, created_by, expires_at, duration_minutes, target_agents)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, token, created_at, expires_at, duration_minutes, target_agents
        `;
        const { rows } = await sinergia_pool.query(query, [
            token,
            req.user.id,
            expires_at.toISOString(),
            duration_minutes,
            JSON.stringify(target_agents)
        ]);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error creating shared link:', error);
        res.status(500).json({ error: 'Erro ao gerar link de compartilhamento' });
    }
});

// Listar links gerados
router.get('/', verifyToken(), verifyModule('tracking_live'), async (req, res) => {
    try {
        // Mostra apenas os links gerados pelo usuário, ou pode mostrar todos (dependendo da regra).
        // Vamos mostrar apenas os gerados pelo usuário para manter a privacidade/controle.
        const query = `
            SELECT id, token, created_at, expires_at, duration_minutes, target_agents, revoked_at
            FROM tracking_shared_links
            WHERE created_by = $1
            ORDER BY created_at DESC
        `;
        const { rows } = await sinergia_pool.query(query, [req.user.id]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching shared links:', error);
        res.status(500).json({ error: 'Erro ao buscar links compartilhados' });
    }
});

// Revogar link
router.post('/:id/revoke', verifyToken(), verifyModule('tracking_live'), async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            UPDATE tracking_shared_links
            SET revoked_at = NOW()
            WHERE id = $1 AND created_by = $2
            RETURNING *
        `;
        const { rows } = await sinergia_pool.query(query, [id, req.user.id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Link não encontrado ou você não tem permissão para revogá-lo' });
        }
        res.json({ success: true, link: rows[0] });
    } catch (error) {
        console.error('Error revoking shared link:', error);
        res.status(500).json({ error: 'Erro ao revogar link' });
    }
});

// Excluir link (apenas admin ou o próprio criador do link)
router.delete('/:id', verifyToken(), verifyModule('tracking_live'), async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.role.toLowerCase().includes('admin');
        
        let query = `DELETE FROM tracking_shared_links WHERE id = $1`;
        let params = [id];
        
        if (!isAdmin) {
            query += ` AND created_by = $2`;
            params.push(req.user.id);
        }
        
        query += ` RETURNING id`;
        
        const { rows } = await sinergia_pool.query(query, params);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Link não encontrado ou você não tem permissão para excluí-lo' });
        }
        res.json({ success: true, id: rows[0].id });
    } catch (error) {
        console.error('Error deleting shared link:', error);
        res.status(500).json({ error: 'Erro ao excluir link' });
    }
});

module.exports = router;
