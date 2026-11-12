import { b64u, unb64u } from './keys'

export interface InvitePayload {
  v: 1
  room: string
  edPub: string
  xPub: string
  displayName: string
  username: string
}

export function encodeInvite(p: InvitePayload): string {
  return 'uchat5:1.' + b64u(new TextEncoder().encode(JSON.stringify(p)))
}

export function decodeInvite(s: string): InvitePayload {
  const m = s.trim().match(/^uchat5:1\.([A-Za-z0-9_-]+)$/)
  if (!m) throw new Error('Invalid invite code')
  return JSON.parse(new TextDecoder().decode(unb64u(m[1]))) as InvitePayload
}

export function newRoomSecret(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(16)))
}
