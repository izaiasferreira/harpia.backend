const XLSX = require('xlsx');
const { create_service_annotation } = require('./serviceAnnotations');

const VALID_TIPOS = ['Remanejamento', 'Anotação', 'Coordenada'];
const VALID_IDENTIFICACAO = ['Medidor', 'Instalação', 'Unidade Consumidora'];
const VALID_ESTADOS = ['pi', 'ma'];

function normalizeString(str) {
    if (!str) return '';
    return String(str)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function normalizeTipo(rawTipo) {
    const norm = normalizeString(rawTipo);
    if (norm === 'remanejamento') return 'Remanejamento';
    if (norm === 'anotacao' || norm === 'anotacao de servico') return 'Anotação';
    if (norm === 'coordenada') return 'Coordenada';
    return String(rawTipo || '').trim();
}

function normalizeIdentificacaoTipo(rawIdTipo) {
    const norm = normalizeString(rawIdTipo);
    if (norm === 'medidor') return 'Medidor';
    if (norm === 'instalacao') return 'Instalação';
    if (norm === 'unidade consumidora' || norm === 'uc') return 'Unidade Consumidora';
    return String(rawIdTipo || '').trim();
}

function parseDateValue(val) {
    if (val === null || val === undefined || val === '') {
        return null;
    }

    if (val instanceof Date) {
        if (isNaN(val.getTime())) return 'INVALID';
        return val.toISOString().slice(0, 10);
    }

    const strVal = String(val).trim();
    if (!strVal) return null;

    // 1. Excel serial date number (e.g. 46240 or "46240")
    const num = Number(strVal);
    if (!isNaN(num) && num > 1000 && num < 100000) {
        // Excel 1900 epoch has 25569 days difference to 1970-01-01
        const dateMs = (num - 25569) * 86400 * 1000;
        const d = new Date(dateMs);
        if (!isNaN(d.getTime())) {
            return d.toISOString().slice(0, 10);
        }
    }

    // 2. Format DD/MM/YYYY or DD/MM/YY (e.g. 06/08/26 or 06/08/2026)
    const brMatch = strVal.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (brMatch) {
        const day = parseInt(brMatch[1], 10);
        const month = parseInt(brMatch[2], 10);
        let year = parseInt(brMatch[3], 10);
        if (year < 100) year += 2000;

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const yyyy = String(year);
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
    }

    // 3. Format YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    const isoMatch = strVal.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10);
        const day = parseInt(isoMatch[3], 10);

        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const yyyy = String(year);
            const mm = String(month).padStart(2, '0');
            const dd = String(day).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        }
    }

    // 4. Fallback standard Date parsing
    const parsedMs = Date.parse(strVal);
    if (!isNaN(parsedMs)) {
        const d = new Date(parsedMs);
        const y = d.getFullYear();
        if (y >= 2000 && y <= 2100) {
            return d.toISOString().slice(0, 10);
        }
    }

    return 'INVALID';
}

async function processServiceAnnotationImport(fileBuffer, user) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const autor = user.id || user.nome || 'admin';

    for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;

        const descricao = String(row['DESCRICAO'] || row['Descrição'] || row['Descricao'] || '').trim();
        const rawTipo = row['TIPO'] || row['Tipo'] || '';
        const tipo = normalizeTipo(rawTipo);

        const rawIdTipo = row['IDENTIFICACAO_TIPO'] || row['Identificação'] || row['Identificacao'] || '';
        const identificacaoTipo = rawIdTipo ? normalizeIdentificacaoTipo(rawIdTipo) : null;

        const identificacaoValor = row['IDENTIFICACAO_VALOR'] !== undefined && row['IDENTIFICACAO_VALOR'] !== null
            ? String(row['IDENTIFICACAO_VALOR']).trim()
            : (row['Identificação Valor'] !== undefined ? String(row['Identificação Valor']).trim() : null);

        const estado = String(row['ESTADO'] || row['Estado'] || 'pi').trim().toLowerCase();
        const regional = String(row['REGIONAL'] || row['Regional'] || '').trim() || null;
        const seccional = String(row['SECCIONAL'] || row['Seccional'] || '').trim() || null;

        const rawExpiresAt = row['EXPIRA_EM'] ?? row['Expira em'] ?? row['EXPIRAEM'] ?? null;
        const expiresAt = parseDateValue(rawExpiresAt);

        const latitude = row['LATITUDE'] !== undefined && row['LATITUDE'] !== null ? String(row['LATITUDE']).trim() : (row['Latitude'] !== undefined ? String(row['Latitude']).trim() : null);
        const longitude = row['LONGITUDE'] !== undefined && row['LONGITUDE'] !== null ? String(row['LONGITUDE']).trim() : (row['Longitude'] !== undefined ? String(row['Longitude']).trim() : null);

        if (!descricao) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: DESCRICAO não informada.`);
            continue;
        }
        if (!VALID_TIPOS.includes(tipo)) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: TIPO "${rawTipo}" inválido. Use: ${VALID_TIPOS.join(', ')}`);
            continue;
        }
        if (!VALID_ESTADOS.includes(estado)) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: ESTADO "${row['ESTADO'] || row['Estado'] || ''}" inválido. Use: PI, MA`);
            continue;
        }
        if (identificacaoTipo && !VALID_IDENTIFICACAO.includes(identificacaoTipo)) {
            errorCount++;
            errors.push(`Linha ${rowNumber}: IDENTIFICACAO_TIPO "${rawIdTipo}" inválido. Use: ${VALID_IDENTIFICACAO.join(', ')}`);
            continue;
        }
        if (expiresAt === 'INVALID') {
            errorCount++;
            errors.push(`Linha ${rowNumber}: EXPIRA_EM "${rawExpiresAt}" é uma data inválida. Use o formato DD/MM/AAAA ou AAAA-MM-DD.`);
            continue;
        }

        try {
            await create_service_annotation({
                autor,
                tipo,
                identificacao_tipo: identificacaoTipo,
                identificacao_valor: identificacaoValor,
                descricao,
                latitude,
                longitude,
                estado,
                seccional,
                regional,
                foto: null,
                expires_at: expiresAt,
            });
            successCount++;
        } catch (dbErr) {
            errorCount++;
            errors.push(`Linha ${rowNumber} (${tipo}): ${dbErr.message}`);
        }
    }

    return {
        totalProcessed: rows.length,
        successCount,
        errorCount,
        created: successCount,
        errors,
    };
}

module.exports = { processServiceAnnotationImport };
