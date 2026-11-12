import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { actions, useStore } from '../state/store'
import { engine } from '../net/engine'
import { reconcileUsernames } from '../net/discovery'
import Avatar from './Avatar'

export default function ChatList() {
  const s = useStore()
  const [showNew, setShowNew] = useState(false)
  const [invite, setInvite] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinErr, setJoinErr] = useState('')
  const [manual, setManual] = useState('')
  const [manualOut, setManualOut] = useState('')

  const peers = Object.entries(s.peers).sort((a, b) => b[1].lastSeen - a[1].lastSeen)
  const names = s.identity ? reconcileUsernames([s.identity, ...peers.map(([, p]) => p.id)]) : {}

  const newInvite = async () => {
    setInvite(await engine.createInvite())
    setShowNew(true)
  }
  const join = async () => {
    try {
      await engine.joinInvite(joinCode)
      setJoinCode('')
      setJoinErr('')
      setShowNew(false)
    } catch {
      setJoinErr('That code did not parse')
    }
  }

  return (
    <div className="h-full flex flex-col max-w-md mx-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h1 className="text-lg font-bold">Chats</h1>
        <button onClick={() => actions.setRoute('settings')} className="text-slate-400 hover:text-slate-200 text-sm">
          Settings
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {peers.length === 0 && !showNew && (
          <div className="p-6 text-center text-slate-500 text-sm">
            No chats yet. Tap “New chat” to invite someone.
          </div>
        )}
        {peers.map(([edPub, p]) => {
          const last = (s.messages[edPub] ?? []).slice(-1)[0]
          return (
            <button
              key={edPub}
              onClick={() => actions.setRoute('chat', edPub)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-900 text-left"
            >
              <div className="relative">
                <Avatar name={p.id.record.displayName} seed={edPub} />
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-950 ${p.status === 'online' ? 'bg-green-500' : 'bg-slate-600'}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">
                  {p.id.record.displayName}
                  <span className="text-slate-500 font-normal text-sm ml-2">@{names[edPub] ?? p.id.record.username}</span>
                </div>
                <div className="text-sm text-slate-400 truncate">
                  {last ? `${last.from === 'me' ? 'You: ' : ''}${last.text}` : 'Say hi'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {showNew && (
        <div className="border-t border-slate-800 p-4 bg-slate-900 max-h-[70%] overflow-y-auto">
          <div className="flex justify-center mb-3 bg-white p-3 rounded-xl w-fit mx-auto">
            <QRCodeSVG value={invite} size={160} />
          </div>
          <p className="text-xs text-slate-500 break-all text-center mb-3">{invite}</p>
          <textarea
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
            placeholder="Paste a friend's invite code here"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 outline-none text-xs mb-2"
            rows={2}
          />
          {joinErr && <p className="text-red-400 text-xs mb-2">{joinErr}</p>}
          <button onClick={join} className="w-full py-2 rounded-lg bg-blue-600 font-semibold text-sm mb-2">
            Join with code
          </button>
          {s.settings.nerd && (
            <div className="mt-2 border-t border-slate-800 pt-3">
              <p className="text-xs text-slate-400 mb-2">Manual connection (no rendezvous):</p>
              <button
                onClick={async () => setManualOut(await engine.manualOffer())}
                className="w-full py-1.5 mb-2 rounded-lg bg-slate-800 text-xs"
              >
                Generate manual offer
              </button>
              <textarea
                value={manual}
                onChange={e => setManual(e.target.value)}
                placeholder="Paste offer here, then apply; send your answer back"
                className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs mb-2"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await engine.manualApply(manual)
                    setManualOut(await engine.manualAccept(manual))
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 text-xs"
                >
                  Apply offer, make answer
                </button>
                <button
                  onClick={async () => {
                    await engine.manualApply(manual)
                    setManual('')
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 text-xs"
                >
                  Apply answer
                </button>
              </div>
              {manualOut && <p className="text-xs text-slate-500 break-all mt-2">{manualOut}</p>}
            </div>
          )}
          <button onClick={() => setShowNew(false)} className="w-full mt-3 py-1.5 text-slate-400 text-sm">
            Close
          </button>
        </div>
      )}

      <button
        onClick={newInvite}
        className="m-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold"
      >
        New chat
      </button>
    </div>
  )
}
