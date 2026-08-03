// Shim de compatibilidade: módulo de storage agora vive em storage.js
// Mantém a interface exportada anteriormente para os consumidores existentes.
module.exports = require('./storage');
