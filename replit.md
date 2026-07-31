# Makamesco Session Generator

A WhatsApp session ID generator web app built with Node.js and Express. Generates Base64 session credentials via QR code or pairing code.

## Overview

Users visit the web UI and connect their WhatsApp account using one of two methods:
1. **Pairing Code** — enter phone number with country code, receive an 8-digit code to enter in WhatsApp → Linked Devices
2. **QR Code** — scan a QR code with the WhatsApp app

Once connected, the Base64 session credentials are displayed on-screen for copying.

## Project Structure

- `voltah.js` — Main Express + WebSocket server (port 5000)
- `whatsapp.js` — WhatsApp session management (Baileys-based, with retry logic and real-time WS events)
- `main.html` — Single-page UI (vanilla JS, green-on-black design, WebSocket real-time updates)
- `temp/` — Temporary auth state storage (cleaned up after session delivery)

## Running

```bash
node voltah.js
```

Server runs on port 5000 (0.0.0.0). Managed via the "Start application" workflow.

## Dependencies

- `@whiskeysockets/baileys` — Official WhatsApp Web API v6.7.24 (vendored in `./baileys-local/`)
- `libsignal` — Signal protocol (GitHub: whiskeysockets/libsignal-node)
- `express` — Web server
- `ws` — WebSocket server for real-time session updates
- `qrcode` — QR code generation
- `pino` — Logger
- `body-parser` — Request body parsing

## Key Features

- 5 selectable pair servers (rotates WhatsApp browser profiles)
- Real-time session status via WebSocket
- Base64 credentials shown on web AND sent to user's own WhatsApp DM
- Auto-cleanup of temp auth files after credential delivery

## Notes

- `@whiskeysockets/baileys` npm registry is blocked by Replit's package firewall — the compiled package is vendored in `./baileys-local/` (downloaded from the npm CDN tarball)
- If you need to update baileys: `curl -sL https://registry.npmjs.org/@whiskeysockets/baileys/-/baileys-X.Y.Z.tgz -o /tmp/b.tgz && mkdir -p /tmp/bp && tar -xzf /tmp/b.tgz -C /tmp/bp --strip-components=1 && cp -r /tmp/bp ./baileys-local`
- Use `pnpm install` (not npm)
