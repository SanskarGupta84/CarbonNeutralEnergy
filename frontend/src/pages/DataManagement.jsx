import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

const TABLE_LIST = [
  'Region','City','Operator','PowerPlant','EnergySource','FuelType','Sector',
  'ConsumerCategory','EnergyProduction','EnergyConsumption','EmissionRecord',
  'WeatherRecord','GridConnection','TransmissionGrid','Installation',
  'ActivityIndicator','TimeRecord'
]

// columns whose names end with _id (other than the table's own pk) are FK lookups
const FK_TABLE = {
  region_id: 'Region',
  city_id: 'City',
  operator_id: 'Operator',
  source_id: 'EnergySource',
  fuel_id: 'FuelType',
  sector_id: 'Sector',
  plant_id: 'PowerPlant',
  time_id: 'TimeRecord',
  grid_id: 'TransmissionGrid',
  weather_id: 'WeatherRecord',
}
const FK_LABEL = {
  Region: 'region_name', City: 'city_name', Operator: 'operator_name',
  EnergySource: 'source_name', FuelType: 'fuel_name', Sector: 'sector_name',
  PowerPlant: 'plant_name', TimeRecord: 'date', TransmissionGrid: 'grid_name',
  WeatherRecord: 'weather_id',
}

export default function DataManagement() {
  const { tableName } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const current = tableName || 'Region'

  const [schema, setSchema] = useState(null)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(15)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null) // null | {} | row
  const [fkData, setFkData] = useState({})

  useEffect(() => { api.get('/api/schema').then(r => setSchema(r.data)) }, [])

  const cfg = schema?.[current]

  const load = useCallback(async () => {
    if (!cfg) return
    setLoading(true)
    try {
      const { data } = await api.get(`/api/tables/${current}`, { params: { q, page, page_size: pageSize } })
      setRows(data.rows); setTotal(data.total)
    } catch (e) {
      toast.error('Failed to load')
    } finally { setLoading(false) }
  }, [current, q, page, pageSize, cfg])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1); setQ('') }, [current])

  // load FK lookups for the current table
  useEffect(() => {
    if (!cfg) return
    const fkCols = cfg.cols.filter(c => c !== cfg.pk && FK_TABLE[c])
    const unique = [...new Set(fkCols.map(c => FK_TABLE[c]))]
    Promise.all(unique.map(t =>
      api.get(`/api/tables/${t}`, { params: { page: 1, page_size: 200 } })
        .then(r => [t, r.data.rows]).catch(() => [t, []])
    )).then(pairs => setFkData(Object.fromEntries(pairs)))
  }, [cfg])

  const canEdit = user?.role === 'admin' || user?.role === 'analyst'
  const canDelete = user?.role === 'admin'

  const onDelete = async (row) => {
    if (!confirm('Delete this record?')) return
    try {
      await api.delete(`/api/tables/${current}/${row[cfg.pk]}`)
      toast.success('Deleted')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Delete failed')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-white">🌿 Data Management</h1>
        <p className="text-leaf-mint/70">Tend to the data that powers your green ecosystem.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABLE_LIST.map(t => (
          <NavLink key={t} to={`/data/${t}`}
            className={({isActive}) =>
              `px-3 py-1.5 rounded-lg text-sm transition ${
                (isActive || (!tableName && t==='Region'))
                  ? 'bg-leaf-fresh/20 text-white border border-leaf-fresh/40'
                  : 'glass-light text-leaf-mint/70 hover:text-leaf-mint'
              }`}>
            {t}
          </NavLink>
        ))}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input className="input max-w-xs" placeholder="🔍 Search…"
            value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
          <div className="text-xs text-leaf-mint/60 ml-auto">{total} records</div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing({})}>+ Add new</button>
          )}
        </div>

        {!cfg ? (
          <div className="py-10 text-center text-leaf-mint/60">Loading schema…</div>
        ) : (
          <div className="overflow-auto rounded-xl">
            <table className="eco">
              <thead>
                <tr>
                  {cfg.cols.map(c => <th key={c}>{c}</th>)}
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={cfg.cols.length+1} className="text-center py-8 text-leaf-mint/60">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={cfg.cols.length+1} className="text-center py-8 text-leaf-mint/60">No records</td></tr>
                )}
                {!loading && rows.map(row => (
                  <tr key={row[cfg.pk]}>
                    {cfg.cols.map(c => (
                      <td key={c} className="text-leaf-mint/90">{formatCell(row[c])}</td>
                    ))}
                    <td className="text-right whitespace-nowrap">
                      {canEdit && <button className="btn btn-ghost text-xs" onClick={()=>setEditing(row)}>✏️ Edit</button>}
                      {canDelete && <button className="btn btn-ghost text-xs text-red-300" onClick={()=>onDelete(row)}>🗑️</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 text-sm text-leaf-mint/70">
          <div>Page {page} of {totalPages}</div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>← Prev</button>
            <button className="btn btn-ghost" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {editing !== null && cfg && (
          <EditModal
            tableName={current}
            cfg={cfg}
            row={editing}
            fkData={fkData}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function formatCell(v) {
  if (v === null || v === undefined) return <span className="text-leaf-mint/30">—</span>
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 40 ? s.slice(0,40)+'…' : s
}

function EditModal({ tableName, cfg, row, fkData, onClose, onSaved }) {
  const isNew = !row[cfg.pk]
  const [form, setForm] = useState(() => {
    const initial = {}
    cfg.cols.forEach(c => initial[c] = row[c] ?? '')
    return initial
  })
  const [saving, setSaving] = useState(false)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    // strip empty strings -> null and convert numerics
    const payload = {}
    cfg.cols.forEach(c => {
      let v = form[c]
      if (v === '' || v === null || v === undefined) {
        if (isNew && c === cfg.pk) return // don't send empty pk
        payload[c] = null
      } else {
        payload[c] = v
      }
    })
    try {
      if (isNew) await api.post(`/api/tables/${tableName}`, payload)
      else await api.put(`/api/tables/${tableName}/${row[cfg.pk]}`, payload)
      toast.success(isNew ? 'Created 🌱' : 'Updated 🌿')
      onSaved()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <motion.div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <motion.div className="glass rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto"
        initial={{scale:0.95, y:20}} animate={{scale:1,y:0}} exit={{scale:0.95}}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">{isNew ? '🌱 New' : '✏️ Edit'} {tableName}</h3>
          <button onClick={onClose} className="text-leaf-mint/70 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cfg.cols.map(c => {
            const fkTable = FK_TABLE[c]
            const isPk = c === cfg.pk
            return (
              <div key={c} className={c.includes('name') ? 'sm:col-span-2' : ''}>
                <div className="label">{c}{isPk && ' (id)'}</div>
                {fkTable && fkTable !== tableName ? (
                  <select className="input" value={form[c] ?? ''} onChange={e=>setField(c, e.target.value)}>
                    <option value="">— none —</option>
                    {(fkData[fkTable] || []).map(r => {
                      const pk = Object.keys(r).find(k => k.endsWith('_id'))
                      const labelCol = FK_LABEL[fkTable]
                      return <option key={r[pk]} value={r[pk]}>{r[labelCol] || r[pk]} (#{r[pk]})</option>
                    })}
                  </select>
                ) : c === 'date' || c === 'installation_date' || c === 'connected_on' ? (
                  <input className="input" type="date" value={form[c] ?? ''} onChange={e=>setField(c, e.target.value)} />
                ) : (
                  <input className="input" value={form[c] ?? ''} onChange={e=>setField(c, e.target.value)}
                    disabled={isPk && !isNew} />
                )}
              </div>
            )
          })}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
