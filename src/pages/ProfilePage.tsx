import { useState } from 'react'
import { Check, MoreHorizontal, Plus, Settings2 } from 'lucide-react'
import type { Game, User } from '../types'

type ProfilePageProps = {
  user: User | null
  hasKey: boolean
  projects: Game[]
  onHome: () => void
  onCreate: () => void
  onOpen: (game: Game) => void
  onKey: () => void
  onUsername: (name: string) => void
  onLogout: () => void
}

export default function ProfilePage({ user, hasKey, projects, onHome, onCreate, onOpen, onKey, onUsername, onLogout }: ProfilePageProps) {
  const [username, setUsername] = useState(user?.username ?? '')
  const avatar = user?.avatar
    ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
    : user?.username?.[0]?.toUpperCase() ?? 'Y'

  return <div className="profile-shell">
    <header className="topbar profile-topbar">
      <button className="brand" onClick={onHome}><span className="brand-mark">✳</span><span>yulya<span className="brand-light">studio</span></span></button>
      <div className="profile-top-actions"><button className="quiet-button" onClick={onHome}>Arcade</button><button className="quiet-button" onClick={onLogout}>Sign out</button><button className="profile-avatar" aria-label="Your avatar">{avatar}</button></div>
    </header>
    <main className="profile-main">
      <div className="profile-hero">
        <div className="profile-avatar profile-avatar-large">{avatar}</div>
        <div><div className="eyebrow">YOUR CREATOR SPACE</div><h1>{user?.username ?? 'creator'}</h1><p>{user?.email}</p>
          {!user?.username && <div className="username-setup"><input value={username} onChange={event => setUsername(event.target.value.toLowerCase())} placeholder="Choose a unique username"/><button className="button button-primary" onClick={() => onUsername(username)}>Save username</button></div>}
        </div>
        <button className="button button-primary" onClick={onCreate}><Plus size={16}/> New project</button>
      </div>
      <div className="profile-tabs"><span className="tab-active">Projects <span>{projects.length}</span></span><button className="tab-settings" onClick={onKey}><Settings2 size={14}/>{hasKey ? 'AI key connected' : 'Connect AI key'}{hasKey && <Check size={13}/>}</button></div>
      <div className="project-grid">
        <button className="project-new-card" onClick={onCreate}><span className="new-card-plus"><Plus size={20}/></span><b>Start with a blank canvas</b><small>HTML, CSS, JavaScript. Your idea goes here.</small></button>
        {projects.map(game => <button className="project-card" key={game.projectId} onClick={() => onOpen(game)}><div className="project-thumb"><span>✦</span><span className="project-thumb-small">{game.title}</span></div><div className="project-card-bottom"><div><b>{game.title}</b><small>Edited recently · {game.visibility}</small></div><MoreHorizontal size={17}/></div></button>)}
      </div>
    </main>
  </div>
}

