const { sinergia_pool } = require('../../db');

/**
 * Insere pontos na tabela de staging de forma instantânea (sem índices complexos, UNLOGGED).
 */
async function insertStagingPoints(agentId, points) {
    if (!points || points.length === 0) return { inserted: 0 };

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const point of points) {
        values.push(`($${paramIdx}, $${paramIdx + 1}::jsonb, NOW(), 'pending')`);
        params.push(agentId.toUpperCase(), JSON.stringify(point));
        paramIdx += 2;
    }

    await sinergia_pool.query(`
        INSERT INTO tracking_staging (agent_id, payload, received_at, status)
        VALUES ${values.join(', ')}
    `, params);

    return { inserted: points.length };
}

/**
 * Retorna o número de registros atualmente pendentes no staging para controle de backpressure.
 */
async function getStagingPendingCount() {
    const { rows } = await sinergia_pool.query(`
        SELECT COUNT(*) as count FROM tracking_staging WHERE status = 'pending'
    `);
    return rows.length > 0 ? parseInt(rows[0].count, 10) : 0;
}

/**
 * Worker: busca lotes de pontos pendentes para processar.
 * Reivindica registros 'pending' e também registros 'processing' presos há > 5 min (reaper pattern).
 * Utiliza SKIP LOCKED para garantir compatibilidade com múltiplos workers/instâncias.
 */
async function claimPendingBatch(limit = 5000) {
    const { rows } = await sinergia_pool.query(`
        UPDATE tracking_staging
        SET status = 'processing',
            attempts = attempts + 1,
            processing_started_at = NOW(),
            error_message = CASE
                WHEN status = 'processing' THEN 'reclaimed after timeout'
                ELSE error_message
            END
        WHERE id IN (
            SELECT id FROM tracking_staging
            WHERE (status = 'pending')
               OR (status = 'processing' AND processing_started_at < NOW() - INTERVAL '5 minutes')
            ORDER BY received_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, agent_id, payload, received_at, attempts
    `, [limit]);
    return rows;
}

/**
 * Worker: marca um lote como concluído (já inserido na tabela final).
 */
async function markBatchDone(ids) {
    if (!ids || ids.length === 0) return;
    await sinergia_pool.query(`
        UPDATE tracking_staging SET status = 'done'
        WHERE id = ANY($1::bigint[])
    `, [ids]);
}

/**
 * Worker: marca falha em um lote de IDs.
 * Se atingir o limite de tentativas, marca permanentemente como 'failed'.
 * Caso contrário, devolve para 'pending' para reprocessamento.
 */
async function markBatchFailed(ids, error, maxAttempts = 3) {
    if (!ids || ids.length === 0) return;
    const errorMsg = error ? error.message || String(error) : 'Unknown error';

    // Para itens que excederam o número máximo de tentativas
    await sinergia_pool.query(`
        UPDATE tracking_staging 
        SET status = 'failed', error_message = $1
        WHERE id = ANY($2::bigint[]) AND attempts >= $3
    `, [errorMsg, ids, maxAttempts]);

    // Devolve os itens restantes para 'pending' para tentar novamente no próximo ciclo
    await sinergia_pool.query(`
        UPDATE tracking_staging 
        SET status = 'pending', error_message = $1
        WHERE id = ANY($2::bigint[]) AND status = 'processing'
    `, [errorMsg, ids]);
}

/**
 * Limpa registros processados com sucesso ou falhos definitivamente (mais de 24h).
 */
async function cleanOldStaging() {
    await sinergia_pool.query(`
        DELETE FROM tracking_staging
        WHERE status IN ('done', 'failed')
        AND received_at < NOW() - INTERVAL '24 hours'
    `);
}

module.exports = {
    insertStagingPoints,
    getStagingPendingCount,
    claimPendingBatch,
    markBatchDone,
    markBatchFailed,
    cleanOldStaging,
};
