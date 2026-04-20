const redis = require('redis');

const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

if (process.env.NODE_ENV !== 'test') {
    (async () => {
        try {
            await redisClient.connect();
            console.log('Conectado ao Redis com sucesso!');
        } catch (err) {
            console.error('Falha ao conectar no Redis:', err);
        }
    })();
}

module.exports = redisClient;
