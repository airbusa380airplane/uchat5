import type { SignedIdentity } from '../crypto/keys'

export type WireMessage =
  | { v: 1; t: 'hello'; id: SignedIdentity; xPub: string }
  | { v: 1; t: 'msg'; ct: string; ts: number }
  | { v: 1; t: 'peers'; ids: SignedIdentity[] }

export function encode(m: WireMessage): string {
  return JSON.stringify(m)
}

export function decode(s: string): WireMessage {
  return JSON.parse(s) as WireMessage
}
