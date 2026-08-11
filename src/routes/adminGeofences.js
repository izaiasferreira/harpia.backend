const express = require('express');
const router = express.Router();
const { cenos_pool } = require('../db');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const { geofenceCreateSchema, geofenceUpdateSchema } = require('../db/schemas/geofences');

// Listar todas as cercas virtuais (limitado ao estado do admin se ele não for super)
router.get('/', verifyToken(), verifyModule('geofences'), async (req, res) => {
    try {
        const adminEstado = req.user.estado; // 'pi' ou 'ma' etc
        
        let query = `
            SELECT id, name, type, estado, geometry, speed_limit, is_active, created_at, updated_at
            FROM tracking_fences
        `;
        const params = [];
        
        if (req.user.role !== 'COMPANY_ADMIN') {
            query += ` WHERE estado = $1 `;
            params.push(adminEstado);
        }

        query += ` ORDER BY created_at DESC`;

        const { rows } = await cenos_pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('[GEOFENCE] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro interno ao listar cercas virtuais' });
    }
});

// Criar nova cerca virtual
router.post('/', verifyToken(), verifyModule('create_geofence'), validate(geofenceCreateSchema), async (req, res) => {
    try {
        const { name, type, estado, geometry, speed_limit, is_active } = req.body;
        
        if (!name || !type || !estado || !geometry) {
            return res.status(400).json({ error: 'Campos obrigatórios faltando' });
        }

        const query = `
            INSERT INTO tracking_fences (name, type, estado, geometry, speed_limit, is_active)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6)
            RETURNING *;
        `;
        const params = [
            name,
            type,
            estado,
            JSON.stringify(geometry),
            speed_limit || null,
            is_active !== undefined ? is_active : true
        ];

        const { rows } = await cenos_pool.query(query, params);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[GEOFENCE] Erro ao criar:', err);
        res.status(500).json({ error: 'Erro interno ao criar cerca virtual' });
    }
});

// Atualizar cerca
router.put('/:id', verifyToken(), verifyModule('update_geofence'), validate(geofenceUpdateSchema), async (req, res) => {
    try {
        const fenceId = parseInt(req.params.id);
        const { name, type, estado, geometry, speed_limit, is_active } = req.body;

        const query = `
            UPDATE tracking_fences
            SET name = COALESCE($1, name),
                type = COALESCE($2, type),
                estado = COALESCE($3, estado),
                geometry = COALESCE($4::jsonb, geometry),
                speed_limit = $5,
                is_active = COALESCE($6, is_active),
                updated_at = NOW()
            WHERE id = $7
            RETURNING *;
        `;
        
        const params = [
            name || null,
            type || null,
            estado || null,
            geometry ? JSON.stringify(geometry) : null,
            speed_limit !== undefined ? speed_limit : null,
            is_active !== undefined ? is_active : null,
            fenceId
        ];

        const { rows } = await cenos_pool.query(query, params);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Cerca não encontrada' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('[GEOFENCE] Erro ao atualizar:', err);
        res.status(500).json({ error: 'Erro interno ao atualizar cerca virtual' });
    }
});

// Deletar cerca
router.delete('/:id', verifyToken(), verifyModule('delete_geofence'), async (req, res) => {
    try {
        const fenceId = parseInt(req.params.id);

        const { rowCount } = await cenos_pool.query('DELETE FROM tracking_fences WHERE id = $1', [fenceId]);
        if (rowCount === 0) {
            return res.status(404).json({ error: 'Cerca não encontrada' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[GEOFENCE] Erro ao deletar:', err);
        res.status(500).json({ error: 'Erro interno ao deletar cerca virtual' });
    }
});

module.exports = router;
