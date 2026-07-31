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

- `toxic-baileys` — WhatsApp Web API (GitHub: FezChat/SocketsBaileys)
- `express` — Web server
- `ws` — WebSocket server for real-time session updates
- `qrcode` — QR code generation
- `pino` — Logger
- `body-parser` — Request body parsing

## Key Features

- 5 selectable pair servers (rotates WhatsApp browser profiles)
- Real-time session status via WebSocket
- Auto-cleanup of temp auth files after credential delivery
- Base64-only output (no WhatsApp messages sent)

## Notes

- Use `pnpm install` (not npm) — includes a `protobufjs` override to v7.x since v6.8.8 is blocked by Replit's firewall
- The `pnpm.overrides.protobufjs` in `package.json` forces the cached v7 build
