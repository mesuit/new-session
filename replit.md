# Dave Session Generator

A WhatsApp session generator web app built with Node.js and Express.

## Overview

This app allows users to generate WhatsApp session IDs via two methods:
1. **QR Code** — scan a QR code with your WhatsApp app
2. **Pair Code** — enter a phone number to receive a pairing code

It uses the Baileys WhatsApp library to handle connections and generate session credentials.

## Project Structure

- `voltah.js` — Main Express server entry point (port 5000)
- `qr.js` — QR code session generation route (`/qr`)
- `pair.js` — Pairing code session generation route (`/code`)
- `id.js` — Random ID generator utility
- `main.html` — Main landing page
- `pair.html` — Pairing code page
- `temp/` — Temporary auth state storage

## Running

```bash
node voltah.js
```

Server runs on port 5000 (0.0.0.0).

## Dependencies

- `express` — Web server
- `@whiskeysockets/baileys` — WhatsApp Web API (from GitHub: kiuur/baileys)
- `maher-zubair-baileys` — Alternative Baileys fork
- `qrcode` — QR code generation
- `pino` — Logger
- `pastebin-js` + `underscore` — Pastebin API integration
- `body-parser` — Request body parsing

## Notes

- Dependencies are managed with **pnpm** (npm install has a known ENOTEMPTY issue with this project)
- Use `pnpm install` for clean dependency installation
- The `temp/` directory stores temporary WhatsApp auth state files during session generation
