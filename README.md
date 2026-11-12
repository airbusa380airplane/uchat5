# uChat5

Private, peer-to-peer, end-to-end encrypted chat as an installable web app (PWA). No accounts, no server you run, message content never leaves your devices.

## Run

```
npm install
npm run dev
```

Open in two browsers/devices, create a profile in each, then exchange the invite QR (or code) under "New chat".

## Architecture

- **Identity**: Ed25519 + X25519 keypairs via WebCrypto, stored in IndexedDB. Signed identity record: `{username, displayName, createdAt, pubkeys}`.
- **Invite**: QR/link carries a random room secret plus pubkeys. Both sides join that room on public Nostr relays (Trystero) purely for signaling (WebRTC SDP/ICE exchange). All messages go direct over WebRTC DataChannels, encrypted with a Double Ratchet session (X25519 DH ratchet + HMAC chain keys + AES-GCM per message, seeded by X25519 ECDH) — forward and future secrecy, out-of-order delivery, tamper-evident headers. See `src/crypto/ratchet.ts`; run tests with `npm test`.
- **Discovery**: rendezvous rooms + signed peer gossip + local peer cache. Manual SDP copy-paste fallback in nerd mode for zero-rendezvous connections. LAN discovery via mDNS candidates where the browser supports it.
- **Usernames**: unique per namespace; when namespaces merge, the later `createdAt` (signed, so unforgeable) gets a `name2` suffix. Deterministic on both sides.
- **Resilience**: any subset of the configured relays works; passphrase-encrypted backup export covers keys + history.
- **Nerd mode** (settings toggle) exposes fingerprints, pubkeys, relay config, connection info, and the manual invite flow.

## Use within network policy

This is an ordinary web app. It does not attempt to evade network filtering or monitoring, and should only be used where permitted.
