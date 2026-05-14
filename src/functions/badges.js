const { seedDefaultBadges, listBadges: listBadgesFromDB } = require('./database/badges');

async function listBadges() {
    await seedDefaultBadges();
    return listBadgesFromDB();
}

module.exports = {
    listBadges
};
