import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { ask } from '../lib/dialog'

// จัดการประกาศบนหน้าแรก: หน้าแรกแสดงประกาศที่เปิดไว้ล่าสุด 3 รายการ (ปักหมุดขึ้นก่อน)
const TAGS = ['', 'ใหม่', 'สำคัญ', 'ด่วน']
const BY = ['ฝ่ายวิชาการ', 'งานวัดผล', 'ฝ่ายบริหารทั่วไป', 'ฝ่ายกิจการนักเรียน', 'ฝ่ายบริหารงานบุคคล', 'ฝ่ายงบประมาณ']
const TAGC = { 'ใหม่': 'p-good', 'สำคัญ': 'p-bad', 'ด่วน': 'p-warn' }
const dt = (t) => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export default function News() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState('')
  const [by, setBy] = useState(BY[0])
  const [busy, setBusy] = useState(false)
  useEffect(() => onSnapshot(collection(db, 'news'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0)))), [])
  const front = list.filter((x) => x.show !== false).sort((a, b) => (!!b.pin - !!a.pin) || (b.at || 0) - (a.at || 0)).slice(0, 3).map((x) => x.id)
  const add = async () => {
    const t = title.trim()
    if (!t) return
    setBusy(true)
    try {
      await addDoc(collection(db, 'news'), { title: t.slice(0, 160), tag, by, show: true, pin: false, at: Date.now(), author: user.uid })
      setTitle(''); setTag('')
    } finally { setBusy(false) }
  }
  const upd = (id, patch) => updateDoc(doc(db, 'news', id), patch)
  const del = async (n) => {
    if (await ask({ title: 'ลบประกาศนี้?', text: n.title, ok: 'ลบ', cancel: 'ไม่ลบ', danger: true })) deleteDoc(doc(db, 'news', n.id))
  }
  return (
    <div className="stack">
      <div className="card stack">
        <h3>เพิ่มประกาศใหม่</h3>
        <label className="stack" style={{ gap: 4 }}><b className="small">หัวข้อประกาศ</b>
          <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น กำหนดสอบแก้ตัว ภาคเรียนที่ 1/2569" onKeyDown={(e) => e.key === 'Enter' && add()} />
        </label>
        <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
          <div className="stack" style={{ gap: 4 }}><b className="small">ป้าย</b>
            <div className="row">{TAGS.map((t) => <button key={t || 'none'} type="button" className="chip" aria-pressed={tag === t} onClick={() => setTag(t)}>{t || 'ไม่มีป้าย'}</button>)}</div>
          </div>
          <label className="stack" style={{ gap: 4 }}><b className="small">ผู้ประกาศ</b>
            <select value={by} onChange={(e) => setBy(e.target.value)}>{BY.map((b) => <option key={b}>{b}</option>)}</select>
          </label>
          <button type="button" className="btn" disabled={busy || !title.trim()} onClick={add}>เพิ่มประกาศ</button>
        </div>
      </div>
      <div className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}><h3>ประกาศทั้งหมด</h3><span className="small muted">{list.length} รายการ · หน้าแรกแสดงล่าสุด 3 รายการ (ปักหมุดขึ้นก่อน)</span></div>
        {!list.length && <div className="empty">ยังไม่มีประกาศ</div>}
        {list.map((n) => (
          <div key={n.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line, #eadbd2)', paddingTop: 10, gap: 10 }}>
            <div className="stack" style={{ gap: 4, flex: '1 1 300px', minWidth: 0 }}>
              <b>{n.title}</b>
              <div className="row small muted" style={{ gap: 8 }}>
                {n.tag && <span className={`pill ${TAGC[n.tag] || ''}`}>{n.tag}</span>}
                <span>{dt(n.at)} · {n.by}</span>
                {front.includes(n.id) && <span style={{ color: '#2e7d32', fontWeight: 700 }}>● อยู่บนหน้าแรก</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm alt" aria-pressed={!!n.pin} onClick={() => upd(n.id, { pin: !n.pin })}>{n.pin ? 'ปักหมุดแล้ว' : 'ปักหมุด'}</button>
              <button type="button" className="btn sm alt" onClick={() => upd(n.id, { show: n.show === false })}>{n.show === false ? 'แสดงบนหน้าแรก' : 'ซ่อนจากหน้าแรก'}</button>
              <button type="button" className="btn sm alt" onClick={() => del(n)}>ลบ</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
