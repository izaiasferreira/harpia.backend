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
const appPins = require('./appPins');
const sentMessages = require('./sentMessages');
const messageTemplates = require('./messageTemplates');
const fcmTokens = require('./fcmTokens');
const agentExemptions = require('./agentExemptions');
const config = require('./config');

module.exports = {
  ...login,
  ...inventory,
  ...justify,
  ...dailyReport,
  ...chat,
  ...notifications,
  ...badges,
  ...permissions,
  ...users,
  ...forms,
  ...training,
  ...ceneduc,
  ...serviceNotes,
  ...tracking,
  ...security,
  ...appPins,
  ...sentMessages,
  ...messageTemplates,
  ...fcmTokens,
  ...agentExemptions,
  ...config
};
