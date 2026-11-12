import { useEffect, useState } from 'react'
import { loadStore, useStore } from './state/store'
import { engine } from './net/engine'
import Onboarding from './ui/Onboarding'
import ChatList from './ui/ChatList'
import ChatView from './ui/ChatView'
import Settings from './ui/Settings'

export default function App() {
  const s = useStore()
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    void loadStore().then(() => setBooted(true))
  }, [])

  useEffect(() => {
    if (booted && s.identity) void engine.start()
  }, [booted, s.identity])

  if (!booted) return null
  if (!s.identity) return <Onboarding />
  if (s.route === 'chat' && s.activeChat) return <ChatView peer={s.activeChat} />
  if (s.route === 'settings') return <Settings />
  return <ChatList />
}
