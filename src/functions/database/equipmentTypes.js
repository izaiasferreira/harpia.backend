const { sinergia_pool } = require('../../db');

async function getEquipmentTypes() {
    const { rows } = await sinergia_pool.query('SELECT slug, label, identificador, campos FROM equipment_types');
    const EQUIPMENT_TYPES = {};
    for (const row of rows) {
        EQUIPMENT_TYPES[row.slug] = {
            label: row.label,
            identificador: row.identificador,
            campos: row.campos
        };
    }
    return EQUIPMENT_TYPES;
}

async function getEquipmentTypeBySlug(slug) {
    const { rows } = await sinergia_pool.query('SELECT slug, label, identificador, campos FROM equipment_types WHERE slug = $1', [slug]);
    if (rows.length === 0) return null;
    return rows[0];
}

async function createEquipmentType({ slug, label, identificador, campos }) {
    const { rows } = await sinergia_pool.query(
        'INSERT INTO equipment_types (slug, label, identificador, campos) VALUES ($1, $2, $3, $4) RETURNING *',
        [slug, label, identificador, JSON.stringify(campos || [])]
    );
    return rows[0];
}

async function updateEquipmentType(slug, { label, identificador, campos }) {
    const { rows } = await sinergia_pool.query(
        'UPDATE equipment_types SET label = $1, identificador = $2, campos = $3 WHERE slug = $4 RETURNING *',
        [label, identificador, JSON.stringify(campos || []), slug]
    );
    return rows[0];
}

async function deleteEquipmentType(slug) {
    const { rowCount } = await sinergia_pool.query('DELETE FROM equipment_types WHERE slug = $1', [slug]);
    return rowCount > 0;
}

module.exports = {
    getEquipmentTypes,
    getEquipmentTypeBySlug,
    createEquipmentType,
    updateEquipmentType,
    deleteEquipmentType
};
