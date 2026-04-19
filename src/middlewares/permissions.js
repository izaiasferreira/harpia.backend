import { userHasModule } from '../functions/database/permissions';

async function checkPermission(moduleId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        if (req.user.role === 'COMPANY_ADMIN') {
            return next();
        }

        const hasPermission = await userHasModule(
            req.user.id,
            moduleId,
            req.user.estado
        );

        if (!hasPermission) {
            return res.status(403).json({ error: 'Permissão negada para este módulo' });
        }

        next();
    };
}

async function getUserAllowedModules(req, res, next) {
    if (!req.user) {
        return next();
    }

    if (req.user.role === 'COMPANY_ADMIN') {
        const { listModules } = require('../functions/database/branches');
        const mods = listModules();
        req.user.modules = mods.map(m => m.id);
    } else {
        const { getUserModules } = require('../functions/database/permissions');
        req.user.modules = await getUserModules(req.user.id, req.user.estado);
    }

    next();
}

export default {
    checkPermission,
    getUserAllowedModules
};