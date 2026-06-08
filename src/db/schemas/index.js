const login = require('./login');
const inventory = require('./inventory');
const justify = require('./justify');
const dailyReport = require('./dailyReport');
const chat = require('./chat');
const notifications = require('./notifications');
const badges = require('./badges');
const permissions = require('./permissions');
const users = require('./users');
const forms = require('./forms');
const training = require('./training');
const ceneduc = require('./ceneduc');
const serviceNotes = require('./serviceNotes');
const tracking = require('./tracking');
const security = require('./security');
const branches = require('./branches');
const appPins = require('./appPins');
const sentMessages = require('./sentMessages');
const messageTemplates = require('./messageTemplates');
const fcmTokens = require('./fcmTokens');
const config = require('./config');

module.exports = {
  ...fcmTokens,
  ...config
};
