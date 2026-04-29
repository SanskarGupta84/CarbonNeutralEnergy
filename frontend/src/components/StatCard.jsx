import { motion } from 'framer-motion'

export default function StatCard({
  title, value, suffix = '', icon = '🌱',
  delay = 0, intensity = 0.4, trend = null, sub = null
}) {
  // intensity 0..1 controls glow strength
  const glow = 12 + intensity * 60
  const alpha = 0.2 + intensity * 0.55
  const trendColor = trend == null ? '' : trend > 0 ? 'text-leaf-glow' : trend < 0 ? 'text-orange-300' : 'text-leaf-mint/60'
  const arrow = trend == null ? '' : trend > 0 ? '▲' : trend < 0 ? '▼' : '■'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay }}
      whileHover={{ y: -6 }}
      className="glass glow-ring rounded-2xl p-5 relative overflow-hidden lift tap"
      style={{ '--glow': `${glow}px`, '--glow-alpha': alpha }}
    >
      <div className="absolute -top-8 -right-8 text-7xl opacity-10 select-none">{icon}</div>
      <div className="text-xs uppercase tracking-wider text-leaf-mint/70">{title}</div>
      <div className="mt-2 text-3xl font-bold text-white">
        {value}
        <span className="text-sm font-normal text-leaf-mint/70 ml-1">{suffix}</span>
      </div>
      {sub && <div className="text-xs text-leaf-mint/60 mt-1">{sub}</div>}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-leaf-fresh to-leaf-glow"
               style={{ width: `${Math.min(100, intensity * 100)}%`, transition: 'width 0.8s ease' }} />
        </div>
        {trend != null && (
          <span className={`text-xs font-mono ${trendColor}`}>{arrow} {Math.abs(trend).toFixed(1)}%</span>
        )}
      </div>
    </motion.div>
  )
}
