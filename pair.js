const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    delay,
    makeCacheableSignalKeyStore,
} = require("whiskeysockets/baileys");

const router = express.Router();

function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    if (!num) {
        return res.json({ code: 'Phone number is required' });
    }

    num = num.replace(/[^0-9]/g, '');

    async function RAVEN() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        const { version } = await fetchLatestBaileysVersion();

        try {
            const client = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
                },
                printQRInTerminal: false,
                version,
                logger: pino({ level: 'silent' }),
                browser: ['Ubuntu', 'Chrome', '22.0.0'],
                markOnlineOnConnect: false,
            });

            if (!client.authState.creds.registered) {
                await delay(1500);
                const code = await client.requestPairingCode(num);
                if (!res.headersSent) {
                    await res.send({ code });
                }
            }

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    await delay(3000);
                    try {
                        const data = fs.readFileSync(`${__dirname}/temp/${id}/creds.json`);
                        const b64data = Buffer.from(data).toString('base64');

                        const session = await client.sendMessage(client.user.id, { text: b64data });

                        await client.sendMessage(client.user.id, {
                            text: `╔════════════════════\n║ ◇ SESSION CONNECTED ◇\n║ 🕳️ BOT: Untoldman😎\n║ 🕳️ TYPE: BASE64\n╚════════════════════`
                        }, { quoted: session });

                    } catch (e) {
                        console.log('Error sending session:', e);
                    }

                    await delay(500);
                    await client.ws.close();
                    removeFile('./temp/' + id);

                } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    RAVEN();
                }
            });

        } catch (err) {
            console.log('Pair service error:', err);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: 'Service Currently Unavailable' });
            }
        }
    }

    await RAVEN();
});

module.exports = router;
