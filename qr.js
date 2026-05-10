const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
} = require("whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let qrSent = false;

    async function RAVEN() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        const { version } = await fetchLatestBaileysVersion();
        try {
            let client = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
                },
                printQRInTerminal: false,
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('Desktop'),
                markOnlineOnConnect: false,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !qrSent) {
                    qrSent = true;
                    const qrBuffer = await QRCode.toBuffer(qr);
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'image/png');
                        res.end(qrBuffer);
                    }
                }

                if (connection === 'open') {
                    await delay(3000);
                    try {
                        const data = fs.readFileSync(`${__dirname}/temp/${id}/creds.json`);
                        const b64data = Buffer.from(data).toString('base64');

                        const session = await client.sendMessage(client.user.id, { text: b64data });

                        const info = `┏━━━❑\n┃🔹 Owner: Untoldman😎\n┃🔹 Type: Base64\n┃🔹 Status: Active\n┗━━━❒`;
                        await client.sendMessage(client.user.id, { text: info }, { quoted: session });
                    } catch (e) {
                        console.log('Error sending session:', e);
                    }

                    await delay(500);
                    await client.ws.close();
                    removeFile('./temp/' + id);

                } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(5000);
                    if (!qrSent) RAVEN();
                }
            });

        } catch (err) {
            console.log('QR service error:', err);
            if (!res.headersSent) {
                res.json({ code: 'Service is Currently Unavailable' });
            }
            removeFile('./temp/' + id);
        }
    }

    return await RAVEN();
});

module.exports = router;
