import { useEffect, useRef, useState } from 'react'
import { actions, useStore } from '../state/store'
import { engine } from '../net/engine'
import { fingerprintOf } from '../crypto/keys'
import { reconcileUsernames } from '../net/discovery'
import Avatar from './Avatar'

export default function ChatView({ peer }: { peer: string }) {
  const s = useStore()
  const [text, setText] = useState('')
  const [fp, setFp] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  const p = s.peers[peer]
  const msgs = s.messages[peer] ?? []
  const names = s.identity ? reconcileUsernames([s.identity, ...Object.values(s.peers).map(x => x.id)]) : {}

  useEffect(() => {
    bottom.current?.scrollIntoView()
  }, [msgs.length])

  useEffect(() => {
    if (s.settings.nerd) fingerprintOf(peer).then(setFp)
  }, [peer, s.settings.nerd])

  if (!p) return null

  const send = () => {
    const t = text.trim()
    if (!t) return
    void engine.sendText(peer, t)
    setText('')
  }

  return (
    <div className="h-full flex flex-col max-w-md mx-auto">
      <header className="flex items-center gap-3 px-3 py-3 border-b border-slate-800">
        <button onClick={() => actions.setRoute('list')} className="text-slate-400 hover:text-slate-200 px-1">
          ←
        </button>
        <Avatar name={p.id.record.displayName} seed={peer} size={36} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{p.id.record.displayName}</div>
          <div className="text-xs text-slate-400 truncate">
            @{names[peer] ?? p.id.record.username} · {p.status}
          </div>
        </div>
      </header>

      {s.settings.nerd && fp && (
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-500 break-all">
          fingerprint: {fp}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {msgs.map(m => (
          <div key={m.id} className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.from === 'me' ? 'self-end bg-blue-600 rounded-br-md' : 'self-start bg-slate-800 rounded-bl-md'} ${m.status === 'queued' ? 'opacity-50' : ''}`}>
            {m.text}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="flex gap-2 p-3 border-t border-slate-800">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Message"
          className="flex-1 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 outline-none focus:border-blue-500"
        />
        <button onClick={send} className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold">
          Send
        </button>
      </div>
    </div>
  )
}
