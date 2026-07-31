const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const pino = require('pino');

const logger = pino({ level: 'warn' });

function loadBaileys() {
  const mod = require('@whiskeysockets/baileys');
  const socketFn = mod.default?.default || mod.default || mod.makeWASocket || mod;
  return {
    makeWASocket: socketFn,
    DisconnectReason: mod.DisconnectReason,
    useMultiFileAuthState: mod.useMultiFileAuthState,
    fetchLatestBaileysVersion: mod.fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore: mod.makeCacheableSignalKeyStore,
    Browsers: mod.Browsers,
  };
}

let baileys;
try {
  baileys = loadBaileys();
} catch (e) {
  console.error('[baileys] Failed to load @whiskeysockets/baileys:', e.message);
}

const activeSessions = new Map();
const MAX_RETRIES = 10;
const PAIRING_CODE_DELAY = 5000;

function generateSessionId() {
  const hex = randomBytes(4).toString('hex');
  return `maka_${hex}`;
}

function getAuthDir(sessionId) {
  const dir = path.join(process.cwd(), 'temp', sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupAuthDir(sessionId) {
  const dir = path.join(process.cwd(), 'temp', sessionId);
  try {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

function readCredentials(authDir) {
  try {
    const credsPath = path.join(authDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const data = fs.readFileSync(credsPath, 'utf-8');
      return Buffer.from(data).toString('base64');
    }
    return null;
  } catch (_) {
    return null;
  }
}

function notifyListeners(session, event, data) {
  for (const listener of session.eventListeners) {
    try { listener(event, data); } catch (_) {}
  }
}

function getSessionStatus(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  return {
    sessionId: session.sessionId,
    status: session.status,
    pairingCode: session.pairingCode,
    qrCode: session.qrCode,
    credentialsBase64: session.credentialsBase64,
    connectionMethod: session.connectionMethod,
    createdAt: session.createdAt,
    linkedAt: session.linkedAt,
  };
}

async function connectSession(session, pairServer = 1) {
  if (session.status === 'terminated') return;

  const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore, Browsers, DisconnectReason } = baileys;

  const { state, saveCreds } = await useMultiFileAuthState(session.authDir);

  let version;
  try {
    const fetched = await fetchLatestBaileysVersion();
    version = fetched.version;
  } catch (_) {
    version = [2, 3000, 1015901307];
  }

  const browsers = [
    Browsers.macOS('Chrome'),
    Browsers.ubuntu('Chrome'),
    Browsers.windows('Edge'),
    Browsers.macOS('Safari'),
    Browsers.ubuntu('Firefox'),
  ];

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: browsers[(pairServer - 1) % browsers.length],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    defaultQueryTimeoutMs: undefined,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    markOnlineOnConnect: false,
    getMessage: async () => ({ conversation: '' }),
  });

  session.socket = sock;
  let pairingCodeRequested = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Request pairing code when connecting
    if (session.connectionMethod === 'pairing' && !state.creds.registered && !pairingCodeRequested) {
      if (connection === 'connecting' || qr) {
        pairingCodeRequested = true;
        const cleanNumber = (session.phoneNumber || '').replace(/[^0-9]/g, '');
        if (cleanNumber.length >= 10) {
          session.status = 'connecting';
          notifyListeners(session, 'status', { status: 'connecting' });
          setTimeout(async () => {
            try {
              if (session.status === 'terminated') return;
              const code = await sock.requestPairingCode(cleanNumber);
              session.pairingCode = code;
              notifyListeners(session, 'pairing_code', { code });
            } catch (err) {
              pairingCodeRequested = false;
              if (session.status !== 'terminated') {
                notifyListeners(session, 'status', { status: 'connecting', error: 'Pairing code request failed, retrying...' });
              }
            }
          }, PAIRING_CODE_DELAY);
        } else {
          session.status = 'failed';
          notifyListeners(session, 'status', { status: 'failed', error: 'Invalid phone number' });
        }
      }
    }

    // Generate QR code
    if (qr && session.connectionMethod === 'qr') {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        session.qrCode = qrDataUrl;
        session.status = 'connecting';
        notifyListeners(session, 'qr', { qrCode: qrDataUrl });
        notifyListeners(session, 'status', { status: 'connecting' });
      } catch (_) {}
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason?.loggedOut;

      if (session.status === 'terminated') return;

      if (isLoggedOut) {
        const isPairingFailure = session.status !== 'connected';
        session.status = 'failed';
        notifyListeners(session, 'status', {
          status: 'failed',
          error: isPairingFailure
            ? 'Pairing failed — WhatsApp rejected the code. Try again or switch server.'
            : 'Device logged out',
        });
        cleanupAuthDir(session.sessionId);
        activeSessions.delete(session.sessionId);
        return;
      }

      if (session.retryCount < session.maxRetries) {
        session.retryCount++;
        const delay = Math.min(3000 * session.retryCount, 15000);
        notifyListeners(session, 'status', { status: 'connecting', message: `Reconnecting (attempt ${session.retryCount})...` });
        setTimeout(async () => {
          if (session.status === 'terminated') return;
          try {
            await connectSession(session, pairServer);
          } catch (err) {
            session.status = 'failed';
            notifyListeners(session, 'status', { status: 'failed', error: err.message });
          }
        }, delay);
      } else {
        session.status = 'failed';
        notifyListeners(session, 'status', { status: 'failed', error: 'Max reconnection attempts reached' });
      }
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.linkedAt = new Date().toISOString();
      session.retryCount = 0;

      await saveCreds();
      await new Promise((r) => setTimeout(r, 1500));

      const creds = readCredentials(session.authDir);
      session.credentialsBase64 = creds || '';

      // Show on web immediately
      notifyListeners(session, 'status', {
        status: 'connected',
        credentialsBase64: session.credentialsBase64,
      });

      // Also send to user's own WhatsApp DM
      try {
        const rawJid = sock.user?.id;
        if (rawJid && session.credentialsBase64) {
          const userNumber = rawJid.split(':')[0].split('@')[0];
          const userJid = `${userNumber}@s.whatsapp.net`;

          // Send the base64 session
          const sessionMsg = await sock.sendMessage(userJid, { text: session.credentialsBase64 });

          // Send a confirmation note quoted to it
          await sock.sendMessage(userJid, {
            text: `╔════════════════════\n║ ✅ MAKAMESCO SESSION\n║ 🔹 Type: Base64\n║ 🔹 Status: Active\n╚════════════════════`,
          }, { quoted: sessionMsg });
        }
      } catch (e) {
        console.log('[makamesco] Could not send session to WhatsApp DM:', e.message);
      }

      // Disconnect and clean up
      setTimeout(async () => {
        if (session.status === 'terminated') return;
        session.status = 'terminated';
        notifyListeners(session, 'status', { status: 'terminated' });
        try { sock.end(undefined); } catch (_) {}
        cleanupAuthDir(session.sessionId);
        activeSessions.delete(session.sessionId);
      }, 6000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

async function createSession(method, phoneNumber, pairServer = 1) {
  if (!baileys) throw new Error('Baileys library not loaded');

  const sessionId = generateSessionId();
  const authDir = getAuthDir(sessionId);

  const session = {
    sessionId,
    socket: null,
    status: 'pending',
    pairingCode: null,
    qrCode: null,
    credentialsBase64: null,
    connectionMethod: method,
    phoneNumber,
    authDir,
    createdAt: new Date().toISOString(),
    linkedAt: null,
    retryCount: 0,
    maxRetries: MAX_RETRIES,
    eventListeners: [],
  };

  activeSessions.set(sessionId, session);

  try {
    await connectSession(session, pairServer);
  } catch (err) {
    session.status = 'failed';
    notifyListeners(session, 'status', { status: 'failed', error: err.message });
  }

  return session;
}

function terminateSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  session.status = 'terminated';
  try { if (session.socket) session.socket.end(undefined); } catch (_) {}
  cleanupAuthDir(sessionId);
  activeSessions.delete(sessionId);
  return true;
}

function addSessionListener(sessionId, listener) {
  const session = activeSessions.get(sessionId);
  if (session) session.eventListeners.push(listener);
}

function removeSessionListener(sessionId, listener) {
  const session = activeSessions.get(sessionId);
  if (session) session.eventListeners = session.eventListeners.filter((l) => l !== listener);
}

module.exports = { createSession, getSessionStatus, terminateSession, addSessionListener, removeSessionListener };
