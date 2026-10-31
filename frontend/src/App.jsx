import React, { useState } from 'react'
import LoginPage from './pages/LoginPage'
import AvatarPage from './pages/AvatarPage'
import RoomPage from './pages/RoomPage'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [avatar, setAvatar] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))

  const handleLogin = (userData) => {
    setUser(userData)
    setToken(localStorage.getItem('token'))
  }

  const handleSelectAvatar = (avatarData) => {
    setAvatar(avatarData)
    // Optionally, call /api/set-avatar here
  }

  if (!user) return <LoginPage onLogin={handleLogin} />
  if (!avatar) return <AvatarPage onSelectAvatar={handleSelectAvatar} />
  return <RoomPage user={user} avatar={avatar} token={token} />
}

export default App
