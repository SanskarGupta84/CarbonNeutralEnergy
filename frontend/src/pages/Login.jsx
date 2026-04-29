import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Particles from '../components/Particles.jsx'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [u, setU] = useState('admin')
  const [p, setP] = useState('admin123')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await login(u.trim(), p)
      toast.success('Welcome back 🌿')
      nav('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <Particles count={28} />
      <div className="glass rounded-3xl p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <svg viewBox="0 0 64 64" className="w-12 h-12 animate-leaf-sway origin-bottom">
            <path fill="#2ecc71" d="M50 8C30 10 14 22 12 44c-1 8 2 12 2 12s14-2 26-12c10-8 14-22 10-36z"/>
          </svg>
          <div>
            <h1 className="text-2xl font-bold text-white">EcoEnergy</h1>
            <p className="text-xs text-leaf-mint/70">Carbon-Neutral Energy Planning</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <div className="label">Username</div>
            <input className="input" value={u} onChange={e=>setU(e.target.value)} required />
          </div>
          <div>
            <div className="label">Password</div>
            <input className="input" type="password" value={p} onChange={e=>setP(e.target.value)} required />
          </div>
          <button disabled={busy} className="btn btn-primary w-full">
            {busy ? 'Signing in…' : 'Enter the Ecosystem'}
          </button>
        </form>
        <div className="mt-4 text-sm text-leaf-mint/60 text-center">
          No account? <Link to="/signup" className="text-leaf-glow hover:underline">Sign up</Link>
        </div>
        <div className="mt-6 text-[11px] text-leaf-mint/50 border-t border-white/10 pt-3">
          Default: <span className="text-leaf-glow">admin / admin123</span>
        </div>
      </div>
    </div>
  )
}
