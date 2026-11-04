import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { ask } from '../lib/dialog'
import { autoTitle, frontList } from '../lib/news'

// จัดการประกาศบนหน้าแรก: หน้าแรกแสดงประกาศที่เปิดไว้ล่าสุด 3 รายการ (ปักหมุดขึ้นก่อน)
const TAGS = ['', 'ใหม่', 'สำคัญ', 'ด่วน']
const BY = ['ฝ่ายวิชาการ', 'งานวัดผล', 'ฝ่ายบริหารทั่วไป', 'ฝ่ายกิจการนักเรียน', 'ฝ่ายบริหารงานบุคคล', 'ฝ่ายงบประมาณ']
const TAGC = { 'ใหม่': 'p-good', 'สำคัญ': 'p-bad', 'ด่วน': 'p-warn' }
const dt = (t) => new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
// วันที่กำหนด (เช่น วันผลการเรียนออก) เก็บเป็น YYYY-MM-DD แยกจากวันที่ลงประกาศ (at)
export const dueDate = (s) => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null }
const dueTxt = (s) => { const d = dueDate(s); return d ? d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' }) : '' }

export default function News() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [title, setTitle] = useState('')
  const [tag, setTag] = useState('')
  const [by, setBy] = useState(BY[0])
  const [due, setDue] = useState('')
  const [dueLabel, setDueLabel] = useState('ผลการเรียนออก')
  const [dueTitle, setDueTitle] = useState('')
  const [editId, setEditId] = useState(null)
  const [busy, setBusy] = useState(false)
  const reset = () => { setTitle(''); setTag(''); setBy(BY[0]); setDue(''); setDueLabel('ผลการเรียนออก'); setDueTitle(''); setEditId(null) }
  const edit = (n) => { setEditId(n.id); setTitle(n.title || ''); setTag(n.tag || ''); setBy(n.by || BY[0]); setDue(n.due || ''); setDueLabel(n.dueLabel || 'ผลการเรียนออก'); setDueTitle(n.dueTitle || ''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  useEffect(() => onSnapshot(collection(db, 'news'), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || 0) - (a.at || 0)))), [])
  const front = frontList(list).map((x) => x.id)
  const add = async () => {
    const t = title.trim()
    if (!t) return
    setBusy(true)
    try {
      const data = { title: t.slice(0, 160), tag, by, due: due || '', dueLabel: (dueLabel.trim() || 'ผลการเรียนออก').slice(0, 40), dueTitle: dueTitle.trim().slice(0, 160) }
      if (editId) await updateDoc(doc(db, 'news', editId), { ...data, editedAt: Date.now() })
      else await addDoc(collection(db, 'news'), { ...data, show: true, pin: false, at: Date.now(), author: user.uid })
      reset()
    } finally { setBusy(false) }
  }
  const upd = (id, patch) => updateDoc(doc(db, 'news', id), patch)
  const del = async (n) => {
    if (await ask({ title: 'ลบประกาศนี้?', text: n.title, ok: 'ลบ', cancel: 'ไม่ลบ', danger: true })) deleteDoc(doc(db, 'news', n.id))
  }
  return (
    <div className="stack">
      <div className="card stack">
        <h3>{editId ? 'แก้ไขประกาศ' : 'เพิ่มประกาศใหม่'}</h3>
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
        </div>
        <div className="row" style={{ alignItems: 'flex-end', gap: 16 }}>
          <label className="stack" style={{ gap: 4 }}><b className="small">วันที่กำหนด (ไม่บังคับ)</b>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="stack" style={{ gap: 4 }}><b className="small">ชื่อวันที่กำหนด</b>
            <input value={dueLabel} maxLength={40} onChange={(e) => setDueLabel(e.target.value)} placeholder="เช่น ผลการเรียนออก, วันสอบแก้ตัว" />
          </label>
          {due && <button type="button" className="btn sm alt" onClick={() => setDue('')}>ไม่กำหนดวันที่</button>}
        </div>
        {due && (
          <label className="stack" style={{ gap: 4 }}><b className="small">ข้อความประกาศใหม่เมื่อถึงวันที่กำหนด (ระบบขึ้นให้อัตโนมัติ)</b>
            <input value={dueTitle} maxLength={160} onChange={(e) => setDueTitle(e.target.value)} placeholder={autoTitle({ title: title || '…', dueLabel })} />
          </label>
        )}
        <div className="small muted">วันที่ลงประกาศระบบบันทึกให้อัตโนมัติ · "วันที่กำหนด" คือวันที่ต้องการแจ้ง เช่น วันที่ผลการเรียนออก หน้าแรกจะแสดงพร้อมนับถอยหลัง</div>
        <div className="row">
          <button type="button" className="btn" disabled={busy || !title.trim()} onClick={add}>{editId ? 'บันทึกการแก้ไข' : 'เพิ่มประกาศ'}</button>
          {editId && <button type="button" className="btn alt" onClick={reset}>ยกเลิกการแก้ไข</button>}
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
                <span>ลงประกาศ {dt(n.at)} · {n.by}</span>
                {n.due && <span style={{ color: '#8c1c1c', fontWeight: 700 }}>{n.dueLabel || 'ผลการเรียนออก'}: {dueTxt(n.due)}</span>}
                {n.due && <span>· เมื่อถึงวันจะขึ้นประกาศ “{autoTitle(n)}”</span>}
                {front.includes(n.id) && <span style={{ color: '#2e7d32', fontWeight: 700 }}>● อยู่บนหน้าแรก</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm alt" onClick={() => edit(n)}>แก้ไข</button>
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
