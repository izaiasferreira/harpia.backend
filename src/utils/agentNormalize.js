// Normalização de dados de agentes no momento de gravação e consulta.
// Regras:
//  - ID/MAT: remove acentos, espaços e caracteres especiais (mantém apenas alfanuméricos) e converte para MAIÚSCULO
//  - Nome, Gestor, Regional, Seccional, Processo: remove espaços duplicados nas bordas, colapsa espaços internos e converte para MAIÚSCULO

function normalizeAgentId(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
}

function normalizeAgentName(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizeTextUpper(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

module.exports = {
    normalizeAgentId,
    normalizeAgentName,
    normalizeTextUpper
};

