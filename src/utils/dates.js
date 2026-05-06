function today() {
    const d = new Date();
    // d.setHours(d.getHours() - 5);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function parse_date(date) {
    // Caso seja formato YYYY-MM-DD puro (para evitar fuso local)
    if (typeof date === 'string' && date.length === 10 && date.includes('-')) {
        const [y, m, d] = date.split('-');
        return `${d}.${m}.${y}`;
    }

    if (date.includes('.') && date.length >= 10) {
        return date;
    }
    
    // Tratamento genérico para outras datas passadas (usando UTC para não retroceder ao dia passado pelo Fuso -3)
    const d = new Date(date);
    if (isNaN(d.getTime())) return today();
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

module.exports = { today, parse_date };