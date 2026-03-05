require('dotenv').config();
const axios = require('axios');

async function sendMessageWhatsappText(number, messageText) {
    try {
        const url = process.env.WHATSAPP_LINK_SEND_TEXT;
        await axios.post(url, { number, message: messageText }, {
            headers: { 'Content-Type': 'application/json' },
        });
        return { status: 'success' };
    } catch (error) {
        console.error('Erro geral:', error.message);
        return null;
    }
}

async function sendMessageWhatsappFile(number, messageText, file) {
    try {
        const url = process.env.WHATSAPP_LINK_SEND_FILES;
        console.log('URL:', url);
        console.log('Body:', { number, message: messageText, file });
        const response = await axios.post(url, { number, message: messageText, file }, {
            headers: { 'Content-Type': 'application/json' },
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error('Erro geral:', error.response.data);
            return { status: 'error' };
        }
        console.error('Erro geral:', error.message);
        return null;
    }
}

module.exports = { sendMessageWhatsappText, sendMessageWhatsappFile };
