const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const bodyParser = require('body-parser');
const path = require('path');
const {
  createSession,
  getSessionStatus,
  terminateSession,
  addSessionListener,
  removeSessionListener,
} = require('./whatsapp');

require('events').EventEmitter.defaultMaxListeners = 500;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const PORT = process.env.PORT || 5000;
__path = process.cwd();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  let currentSessionId = null;
  let currentListener = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && msg.sessionId) {
        if (currentSessionId && currentListener) {
          removeSessionListener(currentSessionId, currentListener);
        }
        currentSessionId = msg.sessionId;
        currentListener = (event, data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event, data, sessionId: currentSessionId }));
          }
        };
        addSessionListener(msg.sessionId, currentListener);

        // Send current status immediately
        const status = getSessionStatus(msg.sessionId);
        if (status && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'status', data: status, sessionId: msg.sessionId }));
        }
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    if (currentSessionId && currentListener) {
      removeSessionListener(currentSessionId, currentListener);
    }
  });
});

// API: Generate session
app.post('/api/generate-session', async (req, res) => {
  try {
    const { method, phoneNumber, pairServer } = req.body;

    if (!method || !['pairing', 'qr'].includes(method)) {
      return res.status(400).json({ error: 'method must be "pairing" or "qr"' });
    }
    if (method === 'pairing' && (!phoneNumber || phoneNumber.replace(/[^0-9]/g, '').length < 10)) {
      return res.status(400).json({ error: 'Valid phone number with country code is required' });
    }

    const session = await createSession(method, phoneNumber, pairServer || 1);

    return res.json({
      sessionId: session.sessionId,
      status: session.status,
      message: method === 'pairing'
        ? 'Connecting to WhatsApp... Pairing code will arrive via WebSocket.'
        : 'Connecting to WhatsApp... QR code will arrive via WebSocket.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API: Session status
app.get('/api/session/:sessionId/status', (req, res) => {
  const status = getSessionStatus(req.params.sessionId);
  if (!status) return res.status(404).json({ error: 'Session not found' });
  return res.json(status);
});

// API: Terminate session
app.post('/api/terminate-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  const ok = terminateSession(sessionId);
  if (!ok) return res.status(404).json({ error: 'Session not found' });
  return res.json({ success: true });
});

// Serve HTML
app.get('/', (req, res) => res.sendFile(path.join(__path, 'main.html')));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  MAKAMESCO Session Generator\n  Running on http://0.0.0.0:${PORT}\n`);
});

module.exports = app;
