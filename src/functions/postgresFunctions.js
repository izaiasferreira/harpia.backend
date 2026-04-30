require('dotenv').config();
const {
    perdas,
    perdasJson
} = require('./database/perdas');
const {
    pontualidade,
    pontualidadeJson
} = require('./database/pontualidade');
const {
    e02Json,
    c16Json
} = require('./database/cnlSemReceita');
const {
    cnl,
    firstCNLJson,
    CNLToLidoJson
} = require('./database/cnl');
const {
    c12_Json,
    C12ToLidoJson,
    firstC12ForAgent,
    licacaoNovaC12ForAgent,
    fastC12ForAgent
} = require('./database/c12');
const {
    pendencias,
    pendenciasJson,
    notStartServices,
    completedServices,
    incompletedServices
} = require('./database/pendencias');
const {
    getLeiturasForAgent,
    getLeiturasPendingForAgent,
    getCalendarForAgent,
    getAgentTelegramId,
    get_instalations,
    get_predicted,
    save_justify,
    get_justify,
    update_justify,
    delete_justify,
    getWeeklyCNLStats,
    checkJustifiedByInstallations,
    pre_create_pending_justify,
    respond_pending_justify,
    get_pending_justify_by_id,
    get_pending_justifies,
    delete_pending_justify,
    save_daily_report,
    get_daily_reports,
    get_daily_report_today,
    delete_daily_report,
    get_inventory_by_agent,
    save_inventory,
    create_security_report,
    get_security_reports,
    getUserData,
    updateProfilePic,
    addBadgeToProfile
} = require('./database/agentes');
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
    get_predicted,
    save_justify,
    get_justify,
    update_justify,
    delete_justify,
    getWeeklyCNLStats,
    checkJustifiedByInstallations,
    pre_create_pending_justify,
    respond_pending_justify,
    get_pending_justify_by_id,
    get_pending_justifies,
    delete_pending_justify,
    save_daily_report,
    get_daily_reports,
    get_daily_report_today,
    delete_daily_report,
    get_inventory_by_agent,
    save_inventory,
    create_security_report,
    get_security_reports,
    getUserData,
    updateProfilePic,
    addBadgeToProfile
};
