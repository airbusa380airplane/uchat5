import { useSyncExternalStore } from 'react'
import type { SignedIdentity } from '../crypto/keys'
import { idbGet, idbSet } from '../crypto/idb'

export interface PeerEntry {
  id: SignedIdentity
  status: 'online' | 'offline'
  lastSeen: number
}

export interface ChatMsg {
  id: string
  from: 'me' | 'them'
  text: string
  ts: number
  status: 'sent' | 'queued'
}

export interface Settings {
  nerd: boolean
  relays: string[]
}

export interface State {
  ready: boolean
  identity: SignedIdentity | null
  identityKeys: { edJwk: JsonWebKey; xJwk: JsonWebKey } | null
  peers: Record<string, PeerEntry>
  messages: Record<string, ChatMsg[]>
  route: 'list' | 'chat' | 'settings'
  activeChat: string | null
  settings: Settings
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
]

let state: State = {
  ready: false,
  identity: null,
  identityKeys: null,
  peers: {},
  messages: {},
  route: 'list',
  activeChat: null,
  settings: { nerd: false, relays: DEFAULT_RELAYS },
}

const listeners = new Set<() => void>()

function emit(): void {
  void persist()
  listeners.forEach(l => l())
}

function set(patch: Partial<State>): void {
  state = { ...state, ...patch }
  emit()
}

async function persist(): Promise<void> {
  try {
    if (state.identity && state.identityKeys) {
      await idbSet('identity', { record: state.identity.record, sig: state.identity.sig, keys: state.identityKeys })
    }
    await idbSet('peers', state.peers)
    await idbSet('messages', state.messages)
    await idbSet('settings', state.settings)
  } catch {
    // persistence is best effort
  }
}

export async function loadStore(): Promise<void> {
  const [ident, peers, messages, settings] = await Promise.all([
    idbGet<{ record: SignedIdentity['record']; sig: string; keys: State['identityKeys'] }>('identity'),
    idbGet<Record<string, PeerEntry>>('peers'),
    idbGet<Record<string, ChatMsg[]>>('messages'),
    idbGet<Settings>('settings'),
  ])
  if (ident) {
    state.identity = { record: ident.record, sig: ident.sig }
    state.identityKeys = ident.keys
  }
  state.peers = peers ?? {}
  state.messages = messages ?? {}
  if (settings) state.settings = settings
  state.ready = true
  emit()
}

export function getState(): State {
  return state
}

export function useStore(): State {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export const actions = {
  setIdentity(identity: SignedIdentity, keys: State['identityKeys']) {
    set({ identity, identityKeys: keys })
  },
  upsertPeer(edPub: string, entry: Partial<PeerEntry>) {
    const prev = state.peers[edPub]
    set({
      peers: {
        ...state.peers,
        [edPub]: {
          id: entry.id ?? prev!.id,
          status: entry.status ?? prev?.status ?? 'offline',
          lastSeen: entry.lastSeen ?? prev?.lastSeen ?? Date.now(),
        },
      },
    })
  },
  setPeerStatus(edPub: string, status: 'online' | 'offline') {
    actions.upsertPeer(edPub, { status })
  },
  addMessage(peer: string, m: ChatMsg) {
    set({ messages: { ...state.messages, [peer]: [...(state.messages[peer] ?? []), m] } })
  },
  updateMessage(peer: string, id: string, patch: Partial<ChatMsg>) {
    const list = state.messages[peer] ?? []
    set({ messages: { ...state.messages, [peer]: list.map(x => (x.id === id ? { ...x, ...patch } : x)) } })
  },
  setRoute(route: State['route'], activeChat: string | null = null) {
    set({ route, activeChat })
  },
  setSettings(patch: Partial<Settings>) {
    set({ settings: { ...state.settings, ...patch } })
  },
}
