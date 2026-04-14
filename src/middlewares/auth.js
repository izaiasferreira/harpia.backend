
require('dotenv').config();

function checkToken(req, res) {
    if (req.query.token !== process.env.API_TOKEN) {
        res.status(401).json({ error: 'Token inválido' });
        return false;
    }
    return true;
}

module.exports = {checkToken};