const { listBadges: listBadgesFromDB } = require('./database/badges');

async function listBadges() {
    return listBadgesFromDB();
}

module.exports = {
    listBadges
};
