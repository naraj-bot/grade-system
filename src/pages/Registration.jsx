import { useState } from 'react'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import { useRegs } from '../lib/useRegs'
import { LEVELS, REG_STATUS, isAdminRole } from '../lib/constants'

const pillOf = (s) => (s === 'ok' ? 'p-good' : s === 'pending' ? 'p-warn' : 'p-bad')

function Codes({ codes, catalog }) {
  return (
    <div className="small">
      {codes.map((c) => {
        const x = catalog.find((y) => y.code === c)
        return <span key={c} className="pill p-gold" style={{ marginRight: 4 }}>{x ? `${x.level} ${x.name}` : c}</span>
      })}
    </div>
  )
}

// แอดมิน: อนุมัติ/ส่งกลับใบลงทะเบียนสอนของครู
function AdminView({ regs }) {
  const { term, catalog } = useData()
  const [msgs, setMsgs] = useState({})
  const list = regs.filter((r) => r.term === term).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const act = (r, status) => {
    if (status === 'back' && !(msgs[r.id] || '').trim()) return alert('พิมพ์ข้อความถึงครูก่อนส่งกลับ')
    return updateDoc(doc(db, 'registrations', r.id), { status, msg: status === 'back' ? msgs[r.id].trim() : '', updatedAt: Date.now() })
  }
  return (
    <div className="stack">
      {list.map((r) => (
        <div className="card stack" key={r.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{r.name}</b><span className={`pill ${pillOf(r.status)}`}>{REG_STATUS[r.status]}</span>
          </div>
          <Codes codes={r.codes} catalog={catalog} />
          {r.msg && <div className="small muted">ข้อความถึงครู: {r.msg}</div>}
          {r.status === 'pending' && (
            <div className="row">
              <button className="btn sm" onClick={() => act(r, 'ok')}>อนุมัติ</button>
              <input placeholder="ข้อความถึงครู (ถ้าไม่ถูกต้อง)" size={26} value={msgs[r.id] || ''}
                onChange={(e) => setMsgs({ ...msgs, [r.id]: e.target.value })} />
              <button className="btn sm alt" onClick={() => act(r, 'back')}>ส่งกลับ</button>
            </div>
          )}
        </div>
      ))}
      {!list.length && <div className="card empty">ยังไม่มีการลงทะเบียนในภาคเรียนนี้</div>}
    </div>
  )
}

// ครู: เลือกชั้น (หลายชั้น) แล้วติ๊กวิชาที่สอน ส่งให้แอดมินอนุมัติทุกภาคเรียน
function TeacherView({ regs }) {
  const { user } = useAuth()
  const { openYear, term, termCatalog, catalog, openSet } = useData()
  const mine = regs.find((r) => r.term === term)
  const [levels, setLevels] = useState(() => new Set(mine ? mine.codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean) : []))
  const [picked, setPicked] = useState(() => new Set(mine ? mine.codes : []))
  const [busy, setBusy] = useState(false)
  const toggle = (set, setter, v) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n) }
  const subj = termCatalog.filter((c) => levels.has(c.level) && openSet.has(c.code))
  const locked = mine?.status === 'ok'

  const submit = async () => {
    if (!picked.size) return alert('เลือกวิชาที่สอนอย่างน้อย 1 วิชา')
    setBusy(true)
    try {
      await setDoc(doc(db, 'registrations', `${openYear.year}_${term}_${user.uid}`), {
        year: openYear.year, term, uid: user.uid, name: user.name,
        codes: [...picked], status: 'pending', msg: '', updatedAt: Date.now(),
      })
    } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      {mine && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>การลงทะเบียนของคุณ (ภาคเรียนที่ {term})</b><span className={`pill ${pillOf(mine.status)}`}>{REG_STATUS[mine.status]}</span>
          </div>
          <Codes codes={mine.codes} catalog={catalog} />
          {mine.msg && <div className="lock small">ข้อความจากแอดมิน: {mine.msg}</div>}
        </div>
      )}
      {locked ? (
        <div className="small muted">การลงทะเบียนนี้ได้รับอนุมัติแล้ว หากต้องการแก้ไขให้แจ้งแอดมิน</div>
      ) : (
        <div className="card stack">
          <h3>1. เลือกชั้นที่สอน (เลือกได้หลายชั้น)</h3>
          <div className="row">
            {LEVELS.map((l) => <button key={l} className="chip" aria-pressed={levels.has(l)} onClick={() => toggle(levels, setLevels, l)}>{l}</button>)}
          </div>
          <h3>2. เลือกวิชา</h3>
          <div className="tw">
            <table>
              <thead><tr><th></th><th>ชั้น</th><th>รหัส</th><th>รายวิชา</th></tr></thead>
              <tbody>
                {subj.map((c) => (
                  <tr key={c.code}>
                    <td><input type="checkbox" checked={picked.has(c.code)} aria-label={`เลือก ${c.name}`} onChange={() => toggle(picked, setPicked, c.code)} /></td>
                    <td>{c.level}</td><td>{c.code}</td><td>{c.name}</td>
                  </tr>
                ))}
                {!subj.length && <tr><td colSpan={4} className="empty">เลือกชั้นก่อน (แสดงเฉพาะวิชาที่แอดมินเปิดสอนแล้ว)</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row"><button className="btn" disabled={busy} onClick={submit}>ส่งให้แอดมินอนุมัติ ({picked.size} วิชา)</button></div>
        </div>
      )}
    </div>
  )
}

export default function Registration() {
  const { user } = useAuth()
  const { openYear } = useData()
  const regs = useRegs()
  if (!openYear) return <div className="card empty">ยังไม่มีปีการศึกษาที่เปิดใช้งาน</div>
  return isAdminRole(user.role) ? <AdminView regs={regs} /> : <TeacherView regs={regs} />
}
