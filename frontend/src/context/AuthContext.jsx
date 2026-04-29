import { createContext, useContext, useEffect, useState } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('cnep_user')
    return raw ? JSON.parse(raw) : null
  })

  const login = async (username, password) => {
    const { data } = await api.post('/api/auth/login', { username, password })
    localStorage.setItem('cnep_token', data.token)
    localStorage.setItem('cnep_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const signup = async (username, password, role) => {
    const { data } = await api.post('/api/auth/signup', { username, password, role })
    localStorage.setItem('cnep_token', data.token)
    localStorage.setItem('cnep_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('cnep_token')
    localStorage.removeItem('cnep_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
