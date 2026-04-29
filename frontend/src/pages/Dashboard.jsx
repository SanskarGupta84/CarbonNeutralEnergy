import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import StatCard from '../components/StatCard.jsx'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar, LineChart, Line
} from 'recharts'

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
const COLORS = ['#2ecc71', '#a8e6cf', '#7bf1a8', '#f1c40f', '#e67e22', '#9b59b6']

const tooltipStyle = {
  background: 'rgba(15,61,46,0.92)',
  border: '1px solid rgba(168,230,207,0.3)',
  borderRadius: 10,
  backdropFilter: 'blur(8px)',
  color: '#e8fbef',
}

function Sparkline({ data, color = '#2ecc71' }) {
  return (
    <ResponsiveContainer width="100%" height={50}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null)
  const [trends, setTrends] = useState(null)

  useEffect(() => {
    api.get('/api/insights/summary').then(r => setSummary(r.data)).catch(()=>{})
    api.get('/api/insights/trends').then(r => setTrends(r.data)).catch(()=>{})
  }, [])

  const merged = useMemo(() => {
    if (!trends) return []
    const map = {}
    const add = (rows, key) => rows?.forEach(r => {
      if (!r.date) return
      map[r.date] = map[r.date] || { date: r.date }
      map[r.date][key] = r.value
    })
    add(trends.production, 'Production')
    add(trends.consumption, 'Consumption')
    add(trends.emissions, 'Emissions')
    return Object.values(map).sort((a,b)=> a.date.localeCompare(b.date))
  }, [trends])

  const balanceSeries = useMemo(() =>
    merged.map(m => ({ date: m.date, Net: (m.Production || 0) - (m.Consumption || 0) }))
  , [merged])

  const renewable = summary?.renewable_share || 0
  const sufficiency = Math.min(200, summary?.self_sufficiency || 0)
  const intensity = summary?.carbon_intensity || 0

  // intensity 0..1 for stat glow
  const totalProd = summary?.total_production || 0
  const maxRef = Math.max(totalProd, summary?.total_consumption || 0, 1)
  const intProd = totalProd / maxRef
  const intCons = (summary?.total_consumption || 0) / maxRef
  const intEmis = Math.min(1, intensity / 1.0)
  const intRen = renewable / 100

  const renewGauge = [{ name: 'renewable', value: renewable, fill: '#2ecc71' }]

  return (
    <div className="space-y-6">
      <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            🌍 Living Energy Dashboard
          </h1>
          <p className="text-leaf-mint/70">A breathing snapshot of your carbon-neutral ecosystem.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-leaf-mint/70">
          <span className="w-2 h-2 rounded-full bg-leaf-fresh live-dot inline-block"></span>
          live · auto-refresh on reload
        </div>
      </motion.div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard delay={0.05} title="Production"  value={fmt(summary?.total_production)} suffix="units" icon="⚡" intensity={intProd} sub={`${fmt(renewable)}% renewable`} />
        <StatCard delay={0.10} title="Consumption" value={fmt(summary?.total_consumption)} suffix="units" icon="🏙️" intensity={intCons} sub={`Self-sufficiency ${fmt(summary?.self_sufficiency)}%`} />
        <StatCard delay={0.15} title="Emissions"   value={fmt(summary?.total_emissions)} suffix="kg CO₂" icon="🌫️" intensity={intEmis} sub={`Intensity ${intensity.toFixed(2)} kg/u`} />
        <StatCard delay={0.20} title="Net Balance" value={fmt(summary?.net_balance)} suffix="units" icon="⚖️" intensity={Math.min(1, Math.abs(summary?.net_balance||0)/maxRef)} sub={(summary?.net_balance||0) >= 0 ? 'Surplus 🌱' : 'Deficit ⚠️'} />
      </div>

      {/* Counts strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ['Plants', summary?.counts?.PowerPlant, '🌿'],
          ['Cities', summary?.counts?.City, '🏙️'],
          ['Regions', summary?.counts?.Region, '🗺️'],
          ['Operators', summary?.counts?.Operator, '👷'],
          ['Sources', summary?.counts?.EnergySource, '🔌'],
        ].map(([label, val, icon], i) => (
          <motion.div key={label}
            initial={{opacity:0, y:12}} animate={{opacity:1, y:0}} transition={{delay: 0.25 + i*0.04}}
            className="glass-light rounded-xl p-3 flex items-center gap-3 lift tap">
            <div className="text-2xl">{icon}</div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-leaf-mint/60">{label}</div>
              <div className="text-lg font-bold text-white">{val ?? 0}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Trends + Renewable gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 lg:col-span-2 h-[380px]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-leaf-mint font-semibold">Energy Trends Over Time</div>
            <div className="text-[10px] text-leaf-mint/60 uppercase tracking-wider">production · consumption · emissions</div>
          </div>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={merged}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.75}/>
                  <stop offset="95%" stopColor="#2ecc71" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a8e6cf" stopOpacity={0.75}/>
                  <stop offset="95%" stopColor="#a8e6cf" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e67e22" stopOpacity={0.75}/>
                  <stop offset="95%" stopColor="#e67e22" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)" />
              <XAxis dataKey="date" tick={{ fill: '#a8e6cf', fontSize: 11 }} />
              <YAxis tick={{ fill: '#a8e6cf', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: '#a8e6cf' }}/>
              <Area type="monotone" dataKey="Production"  stroke="#2ecc71" fill="url(#g1)" strokeWidth={2} />
              <Area type="monotone" dataKey="Consumption" stroke="#a8e6cf" fill="url(#g2)" strokeWidth={2} />
              <Area type="monotone" dataKey="Emissions"   stroke="#e67e22" fill="url(#g3)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-2xl p-5 h-[380px] flex flex-col">
          <div className="text-leaf-mint font-semibold mb-2">Renewable Share</div>
          <div className="flex-1 relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="65%" outerRadius="95%" data={renewGauge} startAngle={220} endAngle={-40}>
                <RadialBar background={{ fill: 'rgba(168,230,207,0.08)' }} dataKey="value" cornerRadius={20} fill="#2ecc71" />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-4xl font-bold text-white">{renewable.toFixed(1)}%</div>
              <div className="text-xs text-leaf-mint/70 uppercase tracking-wider">of generation</div>
            </div>
          </div>
          <div className="text-xs text-leaf-mint/70 mt-2">
            {renewable >= 60 ? '🌱 Strong green base — keep growing.' : renewable >= 30 ? '🌿 Healthy mix — push for more renewables.' : '⚠️ Fossil-heavy — prioritize green capacity.'}
          </div>
        </div>
      </div>

      {/* Source mix + balance + sparklines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 h-[340px]">
          <div className="text-leaf-mint font-semibold mb-3">Source Mix</div>
          <ResponsiveContainer width="100%" height="88%">
            <PieChart>
              <Pie data={summary?.source_mix || []} dataKey="units" nameKey="source_type"
                   outerRadius={100} innerRadius={55} paddingAngle={3}>
                {(summary?.source_mix || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ color: '#a8e6cf', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-2xl p-5 h-[340px] lg:col-span-2">
          <div className="text-leaf-mint font-semibold mb-3">Net Balance (Production − Consumption)</div>
          <ResponsiveContainer width="100%" height="88%">
            <AreaChart data={balanceSeries}>
              <defs>
                <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7bf1a8" stopOpacity={0.7}/>
                  <stop offset="95%" stopColor="#7bf1a8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)" />
              <XAxis dataKey="date" tick={{ fill: '#a8e6cf', fontSize: 11 }} />
              <YAxis tick={{ fill: '#a8e6cf', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="Net" stroke="#7bf1a8" fill="url(#bal)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mini sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Production trend', trends?.production, '#2ecc71'],
          ['Consumption trend', trends?.consumption, '#a8e6cf'],
          ['Emissions trend', trends?.emissions, '#e67e22'],
        ].map(([title, data, color], i) => (
          <motion.div key={title} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.1+i*0.05}}
            className="glass-light rounded-xl p-4 lift">
            <div className="text-xs uppercase tracking-wider text-leaf-mint/70">{title}</div>
            <div className="mt-2"><Sparkline data={data || []} color={color} /></div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
