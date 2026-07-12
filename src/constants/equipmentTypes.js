/**
 * equipmentTypes.js
 *
 * Fonte única de verdade para todos os tipos de equipamento.
 * Para adicionar um novo tipo: apenas insira uma nova entrada aqui.
 * Não é necessário alterar o banco de dados, rotas ou frontend genérico.
 *
 * Estrutura de cada campo:
 *   key        — chave no JSONB `dados`
 *   label      — rótulo exibido na UI
 *   tipo       — 'text' | 'select' | 'select_dependente' | 'imei' | 'telefone' | 'number'
 *   required   — se obrigatório no cadastro/edição
 *   options    — array de opções (para tipo 'select')
 *   dependeDe  — chave do campo pai (para tipo 'select_dependente')
 *   optionsPor — mapa { valorPai: [opções] } (para tipo 'select_dependente')
 *   validation — regra especial: 'imei' | 'impressora_serie' | 'telefone_br'
 *   maxLength  — comprimento máximo (opcional)
 *
 * identificador — campo usado para exibição rápida na listagem (ex: IMEI, Nº Série)
 * icon          — nome de ícone lucide para a UI
 */

const EQUIPMENT_TYPES = {
    pda: {
        label: 'PDA',
        icon: 'smartphone',
        identificador: 'imei_1',
        campos: [
            {
                key: 'imei_1',
                label: 'IMEI 1',
                tipo: 'imei',
                required: false,
                validation: 'imei',
                maxLength: 17,
            },
            {
                key: 'imei_2',
                label: 'IMEI 2',
                tipo: 'imei',
                required: false,
                validation: 'imei',
                maxLength: 17,
            },
            {
                key: 'numero_serie',
                label: 'Nº Série',
                tipo: 'text',
                required: true,
            },
            {
                key: 'numero_chip',
                label: 'Nº Chip',
                tipo: 'telefone',
                required: false,
                validation: 'telefone_br',
            },
            {
                key: 'marca',
                label: 'Marca',
                tipo: 'select',
                required: true,
                options: ['SAMSUNG', 'HONEYWELL'],
            },
            {
                key: 'modelo',
                label: 'Modelo',
                tipo: 'select_dependente',
                required: true,
                dependeDe: 'marca',
                optionsPor: {
                    SAMSUNG: [
                        'SM-A015M', 'SM-A015G', 'SM-A025M', 'SM-A035M', 'SM-A045M',
                        'SM-A047M', 'SM-A055M', 'SM-A057M', 'SM-A058M', 'SM-A105M',
                        'SM-A107M', 'SM-A115M', 'SM-A125M', 'SM-A135M', 'SM-A145M',
                        'SM-A155M', 'SM-A205M', 'SM-A207M', 'SM-A215M', 'SM-A225M',
                        'SM-A235M', 'SM-A245M', 'SM-A305M', 'SM-A315F', 'SM-A325M',
                        'SM-A326M', 'SM-A336M', 'SM-A515F', 'SM-A525M', 'SM-A526B',
                        'SM-A528B', 'SM-A536B', 'SM-A546E', 'SM-A705M', 'SM-A715F',
                        'SM-A725F', 'SM-A736B',
                    ],
                    HONEYWELL: [
                        'EDA50', 'EDA51K', 'EDA51', 'EDA52', 'EDA61',
                        'EDA62', 'EDA71', 'CT40', 'CT45',
                    ],
                },
            },
            {
                key: 'versao_android',
                label: 'Versão Android',
                tipo: 'select',
                required: true,
                options: [
                    '5.0', '5.1', '6.0', '7.0', '7.1',
                    '8.0', '8.1', '9.0', '10.0', '11.0',
                    '12.0', '13.0', '14.0', '15.0', '16.0',
                ],
            },
        ],
    },

    impressora: {
        label: 'Impressora',
        icon: 'printer',
        identificador: 'numero_serie',
        campos: [
            {
                key: 'numero_serie',
                label: 'Nº Série',
                tipo: 'text',
                required: true,
                validation: 'impressora_serie',
                // Deve começar com XXRB e ter ≥14 caracteres
            },
            {
                key: 'marca',
                label: 'Marca',
                tipo: 'select',
                required: true,
                options: ['ZEBRA'],
            },
            {
                key: 'modelo',
                label: 'Modelo',
                tipo: 'select',
                required: true,
                options: ['ZQ520', 'ZQ521'],
            },
        ],
    },

    maquineta: {
        label: 'Maquineta',
        icon: 'credit-card',
        identificador: 'numero_serie',
        campos: [
            {
                key: 'numero_serie',
                label: 'Nº Série',
                tipo: 'text',
                required: true,
            },
            {
                key: 'numero_logico',
                label: 'Nº Lógico (TID)',
                tipo: 'text',
                required: true,
            },
        ],
    },

    // ─── Novos tipos: adicione aqui ───────────────────────────────────────────
    //
    // veiculo: {
    //     label: 'Veículo',
    //     icon: 'car',
    //     identificador: 'placa',
    //     campos: [
    //         { key: 'placa',   label: 'Placa',   tipo: 'text', required: true },
    //         { key: 'modelo',  label: 'Modelo',  tipo: 'text', required: true },
    //         { key: 'ano',     label: 'Ano',     tipo: 'number', required: true },
    //         { key: 'renavam', label: 'Renavam', tipo: 'text', required: false },
    //     ],
    // },
    //
    // tablet: {
    //     label: 'Tablet',
    //     icon: 'tablet',
    //     identificador: 'numero_serie',
    //     campos: [
    //         { key: 'numero_serie', label: 'Nº Série', tipo: 'text', required: true },
    //         { key: 'marca',        label: 'Marca',    tipo: 'select', options: ['SAMSUNG', 'APPLE', 'LENOVO'] },
    //     ],
    // },
};

/** Retorna lista de IDs de tipos disponíveis */
const EQUIPMENT_TIPO_IDS = Object.keys(EQUIPMENT_TYPES);

/** Retorna os campos de um tipo, ou [] se o tipo não existir */
function getCamposByTipo(tipo) {
    return EQUIPMENT_TYPES[tipo]?.campos || [];
}

/** Retorna os campos obrigatórios de um tipo */
function getCamposObrigatoriosByTipo(tipo) {
    return getCamposByTipo(tipo).filter(c => c.required);
}

/** Valida se um objeto `dados` tem todos os campos obrigatórios do tipo */
function validateDados(tipo, dados = {}) {
    const obrigatorios = getCamposObrigatoriosByTipo(tipo);
    const erros = [];
    for (const campo of obrigatorios) {
        if (!dados[campo.key] || String(dados[campo.key]).trim() === '') {
            erros.push(`${campo.label} é obrigatório`);
        }
    }
    return { valid: erros.length === 0, erros };
}

/** Retorna o campo identificador (para exibição rápida em listagens) */
function getIdentificador(tipo, dados = {}) {
    const id = EQUIPMENT_TYPES[tipo]?.identificador;
    return id ? dados[id] : null;
}

module.exports = {
    EQUIPMENT_TYPES,
    EQUIPMENT_TIPO_IDS,
    EQUIPMENT_STATUS:   ['disponivel', 'em_uso', 'manutencao', 'inativo'],
    EQUIPMENT_CONDICAO: ['otimo', 'bom', 'regular', 'ruim', 'danificado'],
    getCamposByTipo,
    getCamposObrigatoriosByTipo,
    validateDados,
    getIdentificador,
};
