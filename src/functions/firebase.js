const admin = require('firebase-admin');
const path = require('path');

let initialized = false;

function initFirebase() {
    if (initialized) return;

    try {
        let serviceAccount;

        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } else {
            const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', '..', 'cenos-622fb-firebase-adminsdk-fbsvc-8a50a89ae2.json');
            serviceAccount = require(serviceAccountPath);
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        initialized = true;
        console.log('[FIREBASE] Inicializado com sucesso');
    } catch (err) {
        console.warn('[FIREBASE] Não inicializado:', err.message);
    }
}

async function sendNotification(fcmToken, title, body, data = {}) {
    if (!initialized) initFirebase();
    if (!initialized) throw new Error('Firebase não inicializado');

    const message = {
        token: fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
    };

    return admin.messaging().send(message);
}

async function sendToMultiple(fcmTokens, title, body, data = {}) {
    if (!initialized) initFirebase();
    if (!initialized) throw new Error('Firebase não inicializado');

    if (fcmTokens.length === 0) return { successCount: 0, failureCount: 0 };

    const message = {
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
        tokens: fcmTokens,
    };

    return admin.messaging().sendEachForMulticast(message);
}

module.exports = { initFirebase, sendNotification, sendToMultiple };
