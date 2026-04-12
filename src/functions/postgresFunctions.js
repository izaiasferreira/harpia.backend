require('dotenv').config();
const { perdas, perdasJson } = require('./database/perdas');
const { pontualidade, pontualidadeJson } = require('./database/pontualidade');
const { e02Json, c16Json } = require('./database/cnlSemReceita');
const { cnl, firstCNLJson, CNLToLidoJson } = require('./database/cnl');
const { c12_Json, C12ToLidoJson, firstC12ForAgent, licacaoNovaC12ForAgent, fastC12ForAgent } = require('./database/c12');
const { pendencias, pendenciasJson, notStartServices, completedServices, incompletedServices } = require('./database/pendencias');
const { getLeiturasForAgent, getLeiturasPendingForAgent, getCalendarForAgent, getAgentTelegramId, get_instalations, get_predicted } = require('./database/agentes');
const { lastUpdate } = require('./database/status');


module.exports = {
    pontualidade,
    pontualidadeJson,
    pendencias,
    pendenciasJson,
    cnl,
    c12Json: c12_Json,
    e02Json,
    c16Json,
    notStartServices,
    completedServices,
    perdas,
    perdasJson,
    C12ToLidoJson,
    CNLToLidoJson,
    firstCNLJson,
    incompletedServices,
    getLeiturasForAgent,
    getLeiturasPendingForAgent,
    firstC12ForAgent,
    fastC12ForAgent,
    licacaoNovaC12ForAgent,
    getCalendarForAgent,
    getAgentTelegramId,
    lastUpdate,
    get_instalations,
    get_predicted
};
