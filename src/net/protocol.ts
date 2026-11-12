import type { SignedIdentity } from '../crypto/keys'
import type { RatchetHeader } from '../crypto/ratchet'

export type WireMessage =
  | { v: 1; t: 'hello'; id: SignedIdentity; xPub: string }
  | { v: 2; t: 'msg'; h: RatchetHeader; ct: string; ts: number }
  | { v: 1; t: 'peers'; ids: SignedIdentity[] }

export function encode(m: WireMessage): string {
  return JSON.stringify(m)
}

export function decode(s: string): WireMessage {
  return JSON.parse(s) as WireMessage
}
