import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Particles from '../components/Particles.jsx'

export default function Signup() {
  const { signup } = useAuth()
  const nav = useNavigate()
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await signup(u.trim(), p, role)
      toast.success('Account created 🌱')
      nav('/')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Signup failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <Particles count={28} />
      <div className="glass rounded-3xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-1">Create your account</h1>
        <p className="text-leaf-mint/70 text-sm mb-6">Join the green ecosystem</p>
        <form onSubmit={submit} className="space-y-4">
          <div><div className="label">Username</div>
            <input className="input" minLength={3} value={u} onChange={e=>setU(e.target.value)} required /></div>
          <div><div className="label">Password (min 6)</div>
            <input className="input" type="password" minLength={6} value={p} onChange={e=>setP(e.target.value)} required /></div>
          <div><div className="label">Role</div>
            <select className="input" value={role} onChange={e=>setRole(e.target.value)}>
              <option value="viewer">Viewer (read-only)</option>
              <option value="analyst">Analyst (read + edit)</option>
              <option value="admin">Admin (full)</option>
            </select></div>
          <button disabled={busy} className="btn btn-primary w-full">{busy ? 'Creating…' : 'Sign up'}</button>
        </form>
        <div className="mt-4 text-sm text-leaf-mint/60 text-center">
          Already have an account? <Link to="/login" className="text-leaf-glow hover:underline">Log in</Link>
        </div>
      </div>
    </div>
  )
}
