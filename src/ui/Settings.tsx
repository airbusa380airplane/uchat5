import { useEffect, useState } from 'react'
import { actions, useStore } from '../state/store'
import { fingerprintOf } from '../crypto/keys'
import { exportBackup } from '../crypto/backup'
import { idbGet } from '../crypto/idb'

export default function Settings() {
  const s = useStore()
  const [pass, setPass] = useState('')
  const [fp, setFp] = useState('')
  const [relays, setRelays] = useState('')

  useEffect(() => {
    if (s.identity) fingerprintOf(s.identity.record.edPub).then(setFp)
    setRelays(s.settings.relays.join('\n'))
  }, [s.identity, s.settings.relays])

  const backup = async () => {
    if (!pass) return
    const data = {
      identity: await idbGet('identity'),
      peers: s.peers,
      messages: s.messages,
      rooms: await idbGet('rooms'),
      settings: s.settings,
    }
    const blob = await exportBackup(pass, data)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'uchat5-backup.enc'
    a.click()
    URL.revokeObjectURL(a.href)
    setPass('')
  }

  return (
    <div className="h-full max-w-md mx-auto overflow-y-auto">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
        <button onClick={() => actions.setRoute('list')} className="text-slate-400 hover:text-slate-200 px-1">
          ←
        </button>
        <h1 className="text-lg font-bold">Settings</h1>
      </header>

      <div className="p-4 flex flex-col gap-4">
        {s.identity && (
          <div className="bg-slate-900 rounded-xl p-4">
            <div className="font-semibold">{s.identity.record.displayName}</div>
            <div className="text-sm text-slate-400">@{s.identity.record.username}</div>
          </div>
        )}

        <label className="flex items-center justify-between bg-slate-900 rounded-xl p-4 cursor-pointer">
          <span>Nerd mode</span>
          <input
            type="checkbox"
            checked={s.settings.nerd}
            onChange={e => actions.setSettings({ nerd: e.target.checked })}
            className="w-5 h-5 accent-blue-600"
          />
        </label>

        <div className="bg-slate-900 rounded-xl p-4">
          <div className="font-semibold mb-2">Back up my chats</div>
          <p className="text-xs text-slate-400 mb-2">Encrypted file with your keys and history. Keep it somewhere safe.</p>
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="Passphrase"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 outline-none"
          />
          <button onClick={backup} className="w-full py-2 rounded-lg bg-blue-600 font-semibold text-sm">
            Download backup
          </button>
        </div>

        {s.settings.nerd && (
          <div className="bg-slate-900 rounded-xl p-4 flex flex-col gap-3 text-xs">
            <div>
              <div className="text-slate-400 mb-1">My fingerprint</div>
              <div className="break-all font-mono text-slate-300">{fp}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-1">My public key</div>
              <div className="break-all font-mono text-slate-300">{s.identity?.record.edPub}</div>
            </div>
            <div>
              <div className="text-slate-400 mb-1">Rendezvous relays (one per line)</div>
              <textarea
                value={relays}
                onChange={e => {
                  setRelays(e.target.value)
                  actions.setSettings({ relays: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })
                }}
                rows={4}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 font-mono"
              />
            </div>
            <div className="text-slate-400">Known peers: {Object.keys(s.peers).length}</div>
          </div>
        )}
      </div>
    </div>
  )
}
