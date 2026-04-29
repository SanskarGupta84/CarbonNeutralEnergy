import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, ComposedChart, Area, ReferenceLine,
  ScatterChart, Scatter, ZAxis, Cell, RadialBarChart, RadialBar, PolarAngleAxis,
  PieChart, Pie
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'

const tooltipStyle = {
  background: 'rgba(15,61,46,0.95)',
  border: '1px solid rgba(168,230,207,0.35)',
  borderRadius: 12,
  color: '#e8fbef',
  boxShadow: '0 10px 40px rgba(46,204,113,0.25)',
}
const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
const pct = (n) => `${(n>=0?'+':'')}${fmt(n)}%`

const SOURCE_COLORS = ['#2ecc71','#7bf1a8','#a8e6cf','#56ccf2','#f1c40f','#e67e22','#e74c3c','#9b59b6']

/* ---------- Forecast card with confidence band ---------- */
function ForecastCard({ title, block, color, icon }) {
  const data = useMemo(() => {
    if (!block) return []
    const map = {}
    ;(block.history || []).forEach(p => { map[p.date] = { date: p.date, Actual: p.value } })
    ;(block.smoothed || []).forEach(p => { map[p.date] = { ...(map[p.date]||{date:p.date}), Smoothed: p.value } })
    const merged = Object.values(map).sort((a,b)=>a.date.localeCompare(b.date))
    const fc = (block.forecast || []).map(p => ({
      date: p.date, Forecast: p.value, Upper: p.upper, Lower: p.lower,
      Band: [p.lower, p.upper],
    }))
    return [...merged, ...fc]
  }, [block])

  const lastA = block?.history?.length ? block.history[block.history.length-1].value : 0
  const lastF = block?.forecast?.length ? block.forecast[block.forecast.length-1].value : lastA
  const delta = lastA ? ((lastF - lastA)/lastA)*100 : 0

  return (
    <motion.div whileHover={{y:-4}} className="glass rounded-2xl p-5 h-[400px] flex flex-col lift">
      <div className="flex items-center justify-between mb-2">
        <div className="text-leaf-mint font-semibold flex items-center gap-2">{icon} {title}</div>
        <div className={`text-xs font-mono px-2 py-1 rounded-full ${delta>=0?'bg-leaf-fresh/20 text-leaf-glow':'bg-orange-500/20 text-orange-300'}`}>
          {delta>=0?'▲':'▼'} {pct(delta)} 14d
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{top:5,right:10,bottom:0,left:-10}}>
            <defs>
              <linearGradient id={`fa-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.65}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)" />
            <XAxis dataKey="date" tick={{ fill:'#a8e6cf', fontSize:10 }} />
            <YAxis tick={{ fill:'#a8e6cf', fontSize:10 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ color:'#a8e6cf', fontSize:11 }} />
            <Area type="monotone" dataKey="Band" stroke="none" fill="#7bf1a8" fillOpacity={0.12} legendType="none"/>
            <Area type="monotone" dataKey="Actual" stroke={color} fill={`url(#fa-${title})`} strokeWidth={2.5} />
            <Line type="monotone" dataKey="Smoothed" stroke="#a8e6cf" strokeWidth={1.5} dot={false} strokeDasharray="4 3"/>
            <Line type="monotone" dataKey="Forecast" stroke="#7bf1a8" strokeWidth={2.5} dot={{ r:3 }} strokeDasharray="6 4"/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-leaf-mint/70 mt-1 italic">{block?.outlook || '—'} <span className="opacity-60">· conf {fmt(block?.confidence)}%</span></div>
    </motion.div>
  )
}

/* ---------- Correlation heatmap ---------- */
function Heatmap({ matrix }) {
  if (!matrix?.length) return <div className="text-leaf-mint/60 text-sm">No correlation data.</div>
  const labels = ['Production','Consumption','Emissions']
  const get = (x,y) => matrix.find(m => m.x===x && m.y===y)?.v ?? 0
  const cellColor = v => {
    const a = Math.min(1, Math.abs(v))
    return v >= 0
      ? `rgba(46,204,113,${0.15 + a*0.7})`
      : `rgba(230,126,34,${0.15 + a*0.7})`
  }
  return (
    <div className="grid grid-cols-4 gap-1 text-xs">
      <div></div>
      {labels.map(l => <div key={l} className="text-leaf-mint text-center font-semibold">{l}</div>)}
      {labels.map(row => (
        <>
          <div key={`r-${row}`} className="text-leaf-mint font-semibold flex items-center">{row}</div>
          {labels.map(col => {
            const v = get(row, col)
            return (
              <motion.div key={`${row}-${col}`} whileHover={{scale:1.05}}
                className="aspect-square rounded-lg flex items-center justify-center text-white font-mono"
                style={{ background: cellColor(v) }}>
                {v.toFixed(2)}
              </motion.div>
            )
          })}
        </>
      ))}
    </div>
  )
}

/* ---------- Scenario simulator ---------- */
function ScenarioPanel() {
  const [rb, setRb] = useState(20)   // renewable boost %
  const [eg, setEg] = useState(10)   // efficiency gain %
  const [cr, setCr] = useState(10)   // consumption reduction %
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/insights/scenario', {
        params: { renewable_boost: rb, efficiency_gain: eg, consumption_reduction: cr }
      })
      setData(r.data)
    } finally { setLoading(false) }
  }
  useEffect(()=>{ run() /* eslint-disable-next-line */ }, [])

  // re-run debounced when sliders change
  useEffect(() => {
    const t = setTimeout(run, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [rb, eg, cr])

  const chartData = useMemo(() => {
    if (!data?.projection) return []
    return data.projection.map(p => ({
      day: `D${p.day}`,
      'Baseline Prod':  p.baseline_production,
      'Scenario Prod':  p.scenario_production,
      'Baseline Cons':  p.baseline_consumption,
      'Scenario Cons':  p.scenario_consumption,
      'Baseline CO₂':   p.baseline_emissions,
      'Scenario CO₂':   p.scenario_emissions,
    }))
  }, [data])

  const Slider = ({label, value, set, color, hint}) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-leaf-mint">{label}</span>
        <span className="font-mono text-white">{value}%</span>
      </div>
      <input type="range" min="0" max="100" value={value}
        onChange={e=>set(Number(e.target.value))}
        className="w-full accent-leaf-fresh cursor-pointer"
        style={{ accentColor: color }} />
      <div className="text-[10px] text-leaf-mint/60">{hint}</div>
    </div>
  )

  return (
    <div className="glass rounded-2xl p-5 lift">
      <div className="flex items-center justify-between mb-4">
        <div className="text-leaf-mint font-semibold flex items-center gap-2">🔮 Scenario Simulator — What-if Engine</div>
        {loading && <div className="text-xs text-leaf-mint/60 animate-pulse">simulating…</div>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Slider label="Renewable capacity boost" value={rb} set={setRb} color="#2ecc71"
                hint="Add solar/wind/hydro capacity" />
        <Slider label="Plant efficiency gain"     value={eg} set={setEg} color="#7bf1a8"
                hint="Modernize equipment & grid" />
        <Slider label="Consumption reduction"     value={cr} set={setCr} color="#56ccf2"
                hint="Demand-side management"/>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            ['Production',  data.deltas.production,  '#2ecc71'],
            ['Consumption', data.deltas.consumption, '#56ccf2'],
            ['Emissions',   data.deltas.emissions,   '#e67e22'],
          ].map(([k,v,c]) => (
            <motion.div key={k} initial={{opacity:0,scale:.9}} animate={{opacity:1,scale:1}}
              className="rounded-xl p-3 border border-leaf-mint/20 bg-white/5">
              <div className="text-[11px] text-leaf-mint">{k} change</div>
              <div className="text-2xl font-bold" style={{color:c}}>{pct(v)}</div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{top:5,right:10,bottom:0,left:-10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
            <XAxis dataKey="day" tick={{fill:'#a8e6cf', fontSize:10}}/>
            <YAxis tick={{fill:'#a8e6cf', fontSize:10}}/>
            <Tooltip contentStyle={tooltipStyle}/>
            <Legend wrapperStyle={{color:'#a8e6cf',fontSize:11}}/>
            <Line type="monotone" dataKey="Baseline Prod" stroke="#2ecc71" strokeDasharray="4 4" dot={false}/>
            <Line type="monotone" dataKey="Scenario Prod" stroke="#7bf1a8" strokeWidth={2.5} dot={false}/>
            <Line type="monotone" dataKey="Baseline Cons" stroke="#56ccf2" strokeDasharray="4 4" dot={false}/>
            <Line type="monotone" dataKey="Scenario Cons" stroke="#a8e6cf" strokeWidth={2.5} dot={false}/>
            <Line type="monotone" dataKey="Baseline CO₂"  stroke="#e67e22" strokeDasharray="4 4" dot={false}/>
            <Line type="monotone" dataKey="Scenario CO₂"  stroke="#e74c3c" strokeWidth={2.5} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-xs text-leaf-mint/60 mt-2 italic">
        Current renewable share: {fmt(data?.renewable_share_now)}% · move sliders to project a 30-day future.
      </div>
    </div>
  )
}

/* ---------- Neutrality ETA gauge ---------- */
function NeutralityCard({ data }) {
  if (!data) return null
  const eta = data.eta_days
  const pctDone = eta ? Math.max(2, Math.min(100, 100 - Math.min(100, eta/3.65))) : 0
  const radial = [{ name: 'progress', value: pctDone, fill: '#2ecc71' }]
  return (
    <div className="glass rounded-2xl p-5 lift h-[340px] flex flex-col">
      <div className="text-leaf-mint font-semibold flex items-center gap-2 mb-2">🎯 Carbon Neutral ETA</div>
      <div className="flex-1 flex items-center justify-center relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="70%" outerRadius="100%" data={radial} startAngle={210} endAngle={-30}>
            <PolarAngleAxis type="number" domain={[0,100]} tick={false}/>
            <RadialBar background={{fill:'rgba(168,230,207,0.1)'}} dataKey="value" cornerRadius={20}/>
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute text-center">
          {eta ? (
            <>
              <div className="text-4xl font-bold text-white">{data.eta_years}</div>
              <div className="text-xs text-leaf-mint">years to neutral</div>
              <div className="text-[10px] text-leaf-mint/60 mt-1">{eta} days</div>
            </>
          ) : (
            <div className="text-sm text-orange-300 px-4">{data.message}</div>
          )}
        </div>
      </div>
      <div className="text-xs text-leaf-mint/70 italic text-center">{data.message}</div>
    </div>
  )
}

/* ---------- Source mix forecast table ---------- */
function SourceForecast({ rows }) {
  if (!rows?.length) return <div className="text-leaf-mint/60 text-sm">No source data.</div>
  return (
    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2">
      {rows.map((r,i)=>(
        <motion.div key={r.source_type} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{delay:i*0.05}}
          className="flex items-center justify-between rounded-xl px-3 py-2 border border-leaf-mint/20 bg-white/5 hover:bg-white/10 transition">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 rounded-full" style={{background: SOURCE_COLORS[i%SOURCE_COLORS.length]}}/>
            <div>
              <div className="text-white font-semibold text-sm">{r.source_type}</div>
              <div className="text-[10px] text-leaf-mint/60">{r.outlook}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono text-white">{fmt(r.forecast_7d)}</div>
            <div className={`text-[10px] font-mono ${r.change_pct>=0?'text-leaf-glow':'text-orange-300'}`}>
              {r.change_pct>=0?'▲':'▼'} {pct(r.change_pct)}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ============ MAIN PAGE ============ */
export default function Insights() {
  const [tab, setTab] = useState('forecast')
  const [days, setDays] = useState(14)

  const [emissions, setEmissions] = useState([])
  const [plants, setPlants] = useState([])
  const [forecast, setForecast] = useState(null)
  const [regions, setRegions] = useState([])
  const [efficiency, setEfficiency] = useState([])
  const [anomalies, setAnomalies] = useState(null)
  const [recos, setRecos] = useState([])
  const [sourceForecast, setSourceForecast] = useState([])
  const [correlation, setCorrelation] = useState(null)
  const [eta, setEta] = useState(null)
  const [weather, setWeather] = useState([])
  const [ranking, setRanking] = useState([])

  const loadAll = (d=days) => {
    api.get('/api/insights/top-emission-cities').then(r=>setEmissions(r.data)).catch(()=>{})
    api.get('/api/insights/top-plants').then(r=>setPlants(r.data)).catch(()=>{})
    api.get('/api/insights/forecast', { params:{days:d} }).then(r=>setForecast(r.data)).catch(()=>{})
    api.get('/api/insights/region-breakdown').then(r=>setRegions(r.data)).catch(()=>{})
    api.get('/api/insights/efficiency').then(r=>setEfficiency(r.data)).catch(()=>{})
    api.get('/api/insights/anomalies').then(r=>setAnomalies(r.data)).catch(()=>{})
    api.get('/api/insights/recommendations').then(r=>setRecos(r.data)).catch(()=>{})
    api.get('/api/insights/source-forecast').then(r=>setSourceForecast(r.data)).catch(()=>{})
    api.get('/api/insights/correlation').then(r=>setCorrelation(r.data)).catch(()=>{})
    api.get('/api/insights/neutrality-eta').then(r=>setEta(r.data)).catch(()=>{})
    api.get('/api/insights/weather-impact').then(r=>setWeather(r.data)).catch(()=>{})
    api.get('/api/insights/region-rank').then(r=>setRanking(r.data)).catch(()=>{})
  }
  useEffect(() => { loadAll(days) /* eslint-disable-next-line */ }, [])
  useEffect(() => {
    api.get('/api/insights/forecast', { params:{days} }).then(r=>setForecast(r.data)).catch(()=>{})
  }, [days])

  // anomaly chart with separated dot dataset to ensure visibility
  const anomalySeries = useMemo(() => {
    if (!anomalies?.series) return []
    const set = new Set((anomalies.anomalies||[]).map(a=>a.date))
    return anomalies.series.map(s => ({
      date: s.date, value: s.value,
      anomaly: set.has(s.date) ? s.value : null
    }))
  }, [anomalies])

  const recoColor = (lvl) => lvl==='good' ? 'border-leaf-fresh/50 bg-leaf-fresh/10'
                          : lvl==='warning' ? 'border-orange-400/40 bg-orange-500/10'
                          : 'border-leaf-mint/30 bg-white/5'

  const TabBtn = ({id, label, icon}) => (
    <button onClick={()=>setTab(id)}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
        tab===id ? 'bg-leaf-fresh text-deep-leaf shadow-lg shadow-leaf-fresh/30'
                 : 'bg-white/5 text-leaf-mint hover:bg-white/10'
      }`}>
      {icon}{label}
    </button>
  )

  return (
    <div className="space-y-6">
      <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">📈 Smart Insights</h1>
          <p className="text-leaf-mint/70">Predictive forecasts, scenario simulation, anomaly detection & green ranking.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-leaf-mint">Forecast horizon</span>
          {[7,14,30].map(d => (
            <button key={d} onClick={()=>setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                days===d?'bg-leaf-fresh text-deep-leaf':'bg-white/5 text-leaf-mint hover:bg-white/10'
              }`}>{d}d</button>
          ))}
          <button onClick={()=>loadAll(days)}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs bg-white/5 text-leaf-mint hover:bg-white/10 transition">
            ⟳ Refresh
          </button>
        </div>
      </motion.div>

      {/* Recommendations strip */}
      {recos?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {recos.map((r, i) => (
            <motion.div key={i} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}}
              className={`rounded-2xl p-4 border ${recoColor(r.level)} backdrop-blur-md lift`}>
              <div className="text-sm font-semibold text-white">{r.title}</div>
              <div className="text-xs text-leaf-mint/80 mt-1">{r.detail}</div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabBtn id="forecast"  label="Forecast"   icon="🔭"/>
        <TabBtn id="scenario"  label="Scenario"   icon="🔮"/>
        <TabBtn id="anomaly"   label="Anomalies"  icon="🚨"/>
        <TabBtn id="ranking"   label="Green Rank" icon="🏆"/>
        <TabBtn id="weather"   label="Weather"    icon="🌦️"/>
      </div>

      <AnimatePresence mode="wait">
        {tab==='forecast' && (
          <motion.div key="f" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ForecastCard title="Production" block={forecast?.production} color="#2ecc71" icon="⚡"/>
              <ForecastCard title="Consumption" block={forecast?.consumption} color="#56ccf2" icon="🏙️"/>
              <ForecastCard title="Emissions" block={forecast?.emissions} color="#e67e22" icon="🌫️"/>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="glass rounded-2xl p-5 lift">
                <div className="text-leaf-mint font-semibold mb-3">🌿 Source Mix Forecast (next 7d)</div>
                <SourceForecast rows={sourceForecast}/>
              </div>
              <div className="glass rounded-2xl p-5 lift">
                <div className="text-leaf-mint font-semibold mb-3">🔗 Metric Correlation</div>
                <Heatmap matrix={correlation?.matrix}/>
                <div className="text-[10px] text-leaf-mint/60 mt-3">
                  Pearson r over {correlation?.samples||0} shared days. Green = positive, orange = negative.
                </div>
              </div>
              <NeutralityCard data={eta}/>
            </div>

            <div className="glass rounded-2xl p-5 h-[420px] lift">
              <div className="text-leaf-mint font-semibold mb-3">🗺️ Region Breakdown</div>
              <ResponsiveContainer width="100%" height="92%">
                <BarChart data={regions} margin={{top:5,right:10,bottom:0,left:-10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
                  <XAxis dataKey="region" tick={{fill:'#a8e6cf',fontSize:11}}/>
                  <YAxis tick={{fill:'#a8e6cf',fontSize:11}}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{color:'#a8e6cf'}}/>
                  <Bar dataKey="production"  fill="#2ecc71" radius={[6,6,0,0]}/>
                  <Bar dataKey="consumption" fill="#56ccf2" radius={[6,6,0,0]}/>
                  <Bar dataKey="emissions"   fill="#e67e22" radius={[6,6,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="glass rounded-2xl p-5 h-[400px] lift">
                <div className="text-leaf-mint font-semibold mb-3">🌫️ Highest-Emission Cities</div>
                <ResponsiveContainer width="100%" height="92%">
                  <BarChart data={emissions} layout="vertical" margin={{left:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
                    <XAxis type="number" tick={{fill:'#a8e6cf',fontSize:11}}/>
                    <YAxis dataKey="city_name" type="category" tick={{fill:'#a8e6cf',fontSize:11}} width={110}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Bar dataKey="total_emission" fill="#e67e22" radius={[0,8,8,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="glass rounded-2xl p-5 h-[400px] lift">
                <div className="text-leaf-mint font-semibold mb-3">⚡ Most Productive Power Plants</div>
                <ResponsiveContainer width="100%" height="92%">
                  <BarChart data={plants} layout="vertical" margin={{left:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
                    <XAxis type="number" tick={{fill:'#a8e6cf',fontSize:11}}/>
                    <YAxis dataKey="plant_name" type="category" tick={{fill:'#a8e6cf',fontSize:11}} width={110}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Bar dataKey="units" fill="#2ecc71" radius={[0,8,8,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 h-[420px] lift">
              <div className="text-leaf-mint font-semibold mb-3">🌿 Plant Efficiency — Capacity vs Generation</div>
              <ResponsiveContainer width="100%" height="92%">
                <ScatterChart margin={{top:10,right:20,bottom:10,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
                  <XAxis type="number" dataKey="capacity" name="Capacity" tick={{fill:'#a8e6cf',fontSize:11}}/>
                  <YAxis type="number" dataKey="units" name="Units" tick={{fill:'#a8e6cf',fontSize:11}}/>
                  <ZAxis type="number" dataKey="efficiency" range={[80,500]} name="Efficiency"/>
                  <Tooltip cursor={{strokeDasharray:'3 3'}} contentStyle={tooltipStyle}
                    formatter={(v,n)=>[fmt(v),n]}
                    labelFormatter={()=>''}/>
                  <Legend wrapperStyle={{color:'#a8e6cf',fontSize:11}}/>
                  <Scatter name="Renewable" data={efficiency.filter(d=>/solar|wind|hydro|geo|bio|renew/i.test(d.source_type||''))} fill="#2ecc71"/>
                  <Scatter name="Fossil/Other" data={efficiency.filter(d=>!/solar|wind|hydro|geo|bio|renew/i.test(d.source_type||''))} fill="#e67e22"/>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {tab==='scenario' && (
          <motion.div key="s" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
            <ScenarioPanel/>
            <NeutralityCard data={eta}/>
          </motion.div>
        )}

        {tab==='anomaly' && (
          <motion.div key="a" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
            <div className="glass rounded-2xl p-5 h-[460px] lift">
              <div className="flex items-center justify-between mb-3">
                <div className="text-leaf-mint font-semibold">🚨 Emission Anomalies (>2σ)</div>
                <div className="text-xs text-leaf-mint/70 font-mono">
                  μ={fmt(anomalies?.mean)} · σ={fmt(anomalies?.std)} · {anomalies?.anomalies?.length||0} flagged
                </div>
              </div>
              <ResponsiveContainer width="100%" height="92%">
                <ComposedChart data={anomalySeries} margin={{top:10,right:10,bottom:0,left:-10}}>
                  <defs>
                    <linearGradient id="anom" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a8e6cf" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="#a8e6cf" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
                  <XAxis dataKey="date" tick={{fill:'#a8e6cf',fontSize:10}}/>
                  <YAxis tick={{fill:'#a8e6cf',fontSize:10}}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <ReferenceLine y={(anomalies?.mean||0)+2*(anomalies?.std||0)} stroke="#e67e22" strokeDasharray="4 4" label={{value:'+2σ',fill:'#e67e22',fontSize:10}}/>
                  <ReferenceLine y={Math.max(0,(anomalies?.mean||0)-2*(anomalies?.std||0))} stroke="#e67e22" strokeDasharray="4 4" label={{value:'-2σ',fill:'#e67e22',fontSize:10}}/>
                  <ReferenceLine y={anomalies?.mean||0} stroke="#a8e6cf" strokeDasharray="2 4" label={{value:'mean',fill:'#a8e6cf',fontSize:10}}/>
                  <Area type="monotone" dataKey="value" stroke="#a8e6cf" strokeWidth={2} fill="url(#anom)"/>
                  <Line type="monotone" dataKey="anomaly" stroke="none" dot={{r:6, fill:'#ff6b6b', stroke:'#fff', strokeWidth:2}} activeDot={{r:8}} connectNulls={false}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="glass rounded-2xl p-5 lift">
              <div className="text-leaf-mint font-semibold mb-3">📋 Flagged Days</div>
              {anomalies?.anomalies?.length ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {anomalies.anomalies.map(a => (
                    <div key={a.date} className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-2">
                      <div className="text-xs text-leaf-mint">{a.date}</div>
                      <div className="font-mono text-orange-200">{fmt(a.value)} CO₂</div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-leaf-mint/60 text-sm">No anomalies detected — your grid is breathing evenly. 🌱</div>}
            </div>
          </motion.div>
        )}

        {tab==='ranking' && (
          <motion.div key="r" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
            <div className="glass rounded-2xl p-5 lift">
              <div className="text-leaf-mint font-semibold mb-3">🏆 Region Green-Score Ranking</div>
              <div className="space-y-2">
                {ranking.map((r,i)=>(
                  <motion.div key={r.region} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:i*0.04}}
                    className="flex items-center gap-3 rounded-xl border border-leaf-mint/20 bg-white/5 px-3 py-2">
                    <div className="w-8 text-center font-bold text-leaf-mint">#{i+1}</div>
                    <div className="flex-1">
                      <div className="text-white font-semibold text-sm">{r.region}</div>
                      <div className="text-[10px] text-leaf-mint/60">
                        prod {fmt(r.production)} · CO₂ {fmt(r.emissions)} · intensity {fmt(r.intensity)}
                      </div>
                      <div className="h-2 rounded-full bg-white/10 mt-1 overflow-hidden">
                        <motion.div initial={{width:0}} animate={{width:`${r.green_score}%`}}
                          transition={{duration:0.8, delay:i*0.05}}
                          className="h-full rounded-full"
                          style={{background:`linear-gradient(90deg,#2ecc71,#7bf1a8)`}}/>
                      </div>
                    </div>
                    <div className="w-16 text-right">
                      <div className="text-xl font-bold text-leaf-glow">{fmt(r.green_score)}</div>
                      <div className="text-[10px] text-leaf-mint/60">score</div>
                    </div>
                  </motion.div>
                ))}
                {!ranking.length && <div className="text-leaf-mint/60 text-sm">No region data.</div>}
              </div>
            </div>
          </motion.div>
        )}

        {tab==='weather' && (
          <motion.div key="w" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="space-y-4">
            <div className="glass rounded-2xl p-5 h-[420px] lift">
              <div className="text-leaf-mint font-semibold mb-3">🌦️ Weather Impact on Production</div>
              {weather.length ? (
                <ResponsiveContainer width="100%" height="92%">
                  <BarChart data={weather} margin={{top:5,right:10,bottom:0,left:-10}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(168,230,207,0.1)"/>
                    <XAxis dataKey="condition" tick={{fill:'#a8e6cf',fontSize:11}}/>
                    <YAxis tick={{fill:'#a8e6cf',fontSize:11}}/>
                    <Tooltip contentStyle={tooltipStyle}/>
                    <Bar dataKey="avg_units" radius={[6,6,0,0]}>
                      {weather.map((_,i)=>(<Cell key={i} fill={SOURCE_COLORS[i%SOURCE_COLORS.length]}/>))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-leaf-mint/60 text-sm">
                  No weather-linked production data available in this dataset.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
