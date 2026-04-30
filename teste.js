const { get_instalation_matriz } = require('./src/functions/database/commom');

get_instalation_matriz({ estado: 'pi', instalacao: ['97454'] }).then(console.log);