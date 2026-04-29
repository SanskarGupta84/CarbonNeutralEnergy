import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import Particles from './Particles.jsx'

const Leaf = ({ leafRef }) => (
  <svg ref={leafRef} viewBox="0 0 64 64" className="w-9 h-9 leaf-react">
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7bf1a8"/>
        <stop offset="100%" stopColor="#2ecc71"/>
      </linearGradient>
    </defs>
    <path fill="url(#lg)" d="M50 8C30 10 14 22 12 44c-1 8 2 12 2 12s14-2 26-12c10-8 14-22 10-36z"/>
    <path stroke="#0f3d2e" strokeWidth="2" strokeLinecap="round" fill="none" d="M14 56C22 40 34 28 50 18"/>
  </svg>
)

const navItem = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-3 rounded-xl tap transition-all ${
    isActive
      ? 'bg-leaf-fresh/20 text-white shadow-inner shadow-leaf-fresh/30 ring-1 ring-leaf-fresh/30'
      : 'text-leaf-mint/70 hover:bg-white/5 hover:text-leaf-mint hover:translate-x-1'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const leafRef = useRef(null)

  // Cursor reactivity: update CSS vars for backdrop glow + leaf tilt
  useEffect(() => {
    const onMove = (e) => {
      const x = e.clientX, y = e.clientY
      const w = window.innerWidth, h = window.innerHeight
      document.documentElement.style.setProperty('--cursor-x', `${x}px`)
      document.documentElement.style.setProperty('--cursor-y', `${y}px`)
      // leaf tilts -15..15 deg based on horizontal cursor
      const tilt = ((x / w) - 0.5) * 30
      if (leafRef.current) {
        leafRef.current.style.setProperty('transform', `rotate(${tilt.toFixed(2)}deg)`)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div className="min-h-screen flex">
      <Particles />
      <aside className="w-64 glass m-4 rounded-2xl p-5 flex flex-col">
        <div className="flex items-center gap-3 mb-8">
          <Leaf leafRef={leafRef} />
          <div>
            <div className="font-bold text-leaf-mint">EcoEnergy</div>
            <div className="text-[10px] text-leaf-mint/60 uppercase tracking-wider">Carbon-Neutral Planning</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink to="/" end className={navItem}>🌍 <span>Dashboard</span></NavLink>
          <NavLink to="/data" className={navItem}>🌿 <span>Data Management</span></NavLink>
          <NavLink to="/insights" className={navItem}>📈 <span>Smart Insights</span></NavLink>
        </nav>

        <div className="glass-light rounded-xl p-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-leaf-fresh live-dot inline-block"></span>
            <div className="text-xs text-leaf-mint/60">Logged in as</div>
          </div>
          <div className="font-semibold text-leaf-mint truncate">{user?.username}</div>
          <div className="text-[10px] uppercase tracking-wider text-leaf-glow">{user?.role}</div>
          <button className="btn btn-ghost text-sm mt-2 w-full justify-center tap"
            onClick={() => { logout(); navigate('/login') }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-auto fade-up">
        <Outlet />
      </main>
    </div>
  )
}
