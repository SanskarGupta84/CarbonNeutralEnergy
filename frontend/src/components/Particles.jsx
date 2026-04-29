import { useMemo } from 'react'

export default function Particles({ count = 28 }) {
  const items = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 3 + Math.random() * 12,
    delay: Math.random() * 14,
    duration: 14 + Math.random() * 18,
    opacity: 0.4 + Math.random() * 0.5,
  })), [count])

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {items.map(p => (
        <span key={p.id} className="particle"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity,
          }}/>
      ))}
    </div>
  )
}
