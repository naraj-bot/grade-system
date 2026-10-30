import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import Catalog from './Catalog'
import { useRegs } from '../lib/useRegs'
import { notify } from '../lib/notify'
import { tell } from '../lib/dialog'
import { LEVELS, REG_STATUS, isAdminRole } from '../lib/constants'

const Row = memo(function Row({ c, on, onToggle }) {
  return (
    <tr>
      <td><input type="checkbox" checked={on} aria-label={`เลือก ${c.name}`} onChange={() => onToggle(c.code)} /></td>
      <td>{c.level}</td><td>{c.code}</td><td>{c.name}</td>
    </tr>
  )
})

const pillOf = (s) => (s === 'ok' ? 'p-good' : s === 'pending' ? 'p-warn' : 'p-bad')

function Codes({ codes, catalog }) {
  // จัดกลุ่มตามชั้น: แถวละชั้น  [ชั้น] วิชา · วิชา · วิชา
  const by = {}
  codes.forEach((c) => {
    const x = catalog.find((y) => y.code === c)
    const L = x ? x.level : '?'
    ;(by[L] = by[L] || []).push(x ? x.name : c)
  })
  const order = [...LEVELS, '?'].filter((l) => by[l])
  return (
    <div className="regsum">
      {order.map((l) => (
        <div className="rs-row" key={l}>
          <span className="rs-lv">{l === '?' ? 'อื่นๆ' : l}</span>
          <span className="rs-sub">{by[l].join('  ·  ')}</span>
        </div>
      ))}
    </div>
  )
}

// แอดมิน: อนุมัติ/ส่งกลับใบลงทะเบียนสอนของครู
function AdminView({ regs }) {
  const { user } = useAuth()
  const { term, catalog } = useData()
  const [msgs, setMsgs] = useState({})
  const list = regs.filter((r) => r.term === term).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const act = async (r, status) => {
    if (status === 'back' && !(msgs[r.id] || '').trim()) return tell({ title: 'ยังไม่ได้พิมพ์ข้อความ', text: 'พิมพ์ข้อความถึงครูก่อนส่งกลับ เพื่อให้ครูรู้ว่าต้องแก้อะไร', tone: 'warn' })
    const msg = status === 'back' ? msgs[r.id].trim() : ''
    await updateDoc(doc(db, 'registrations', r.id), { status, msg, updatedAt: Date.now() })
    notify(r.uid, status === 'ok' ? `แอดมินอนุมัติการลงทะเบียนสอนของคุณแล้ว (ภาคเรียนที่ ${r.term})` : `แอดมินส่งการลงทะเบียนกลับ: ${msg}`, 'reg', user.uid)
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
      {!list.length && <div className="card empty">ยังไม่มีครูท่านอื่นส่งลงทะเบียนในภาคเรียนนี้ (วิชาของคุณเองอยู่ในกล่อง "วิชาที่ฉันสอน" ด้านบน)</div>}
    </div>
  )
}

// ครู: เลือกชั้น (หลายชั้น) แล้วติ๊กวิชาที่สอน ส่งให้แอดมินอนุมัติทุกภาคเรียน
function TeacherView({ regs }) {
  const { user } = useAuth()
  const { openYear, term, termCatalog, catalog, openSet } = useData()
  const admin = isAdminRole(user.role)
  const mine = regs.find((r) => r.term === term && r.uid === user.uid)
  const [levels, setLevels] = useState(() => new Set(mine ? mine.codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean) : []))
  const [picked, setPicked] = useState(() => new Set(mine ? mine.codes : []))
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!mine) return
    setPicked(new Set(mine.codes))
    setLevels(new Set(mine.codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean)))
  }, [mine?.updatedAt, mine?.status])
  // เปลี่ยนภาคเรียน/ปี: เริ่มใหม่จากใบลงทะเบียนของภาคนั้น (ไม่ค้างของภาคก่อน)
  useEffect(() => {
    setPicked(new Set(mine ? mine.codes : []))
    setLevels(new Set(mine ? mine.codes.map((c) => catalog.find((x) => x.code === c)?.level).filter(Boolean) : []))
  }, [term, openYear?.year])
  const subj = useMemo(() => termCatalog.filter((c) => levels.has(c.level) && openSet.has(c.code)), [termCatalog, levels, openSet])
  // เปลี่ยนชั้น: ชั้นที่เอาออก → ล้างวิชาที่เคยติ๊กไว้ของชั้นนั้นด้วย
  const toggleLevel = (l) => {
    const n = new Set(levels)
    if (n.has(l)) {
      n.delete(l)
      setPicked((p) => new Set([...p].filter((code) => catalog.find((x) => x.code === code)?.level !== l)))
    } else n.add(l)
    setLevels(n)
  }
  const togglePick = useCallback((code) => setPicked((p) => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n }), [])
  const clearAll = () => { setLevels(new Set()); setPicked(new Set()) }
  const locked = !admin && mine?.status === 'ok'

  const submit = async () => {
    const codes = [...picked].filter((code) => levels.has(catalog.find((x) => x.code === code)?.level))
    if (!codes.length) return tell({ title: 'ยังไม่ได้เลือกวิชา', text: 'เลือกวิชาที่สอนอย่างน้อย 1 วิชา', tone: 'warn' })
    setBusy(true)
    try {
      await setDoc(doc(db, 'registrations', `${openYear.year}_${term}_${user.uid}`), {
        year: openYear.year, term, uid: user.uid, name: user.name,
        codes, status: admin ? 'ok' : 'pending', msg: '', updatedAt: Date.now(),
      })
      if (!admin) notify('admins', `${user.name} ส่งลงทะเบียนสอน ${codes.length} วิชา (ภาคเรียนที่ ${term}) รออนุมัติ`, 'reg', user.uid)
      tell({ title: 'บันทึกแล้ว', text: admin ? `บันทึกวิชาที่สอน ${codes.length} วิชา (ภาคเรียนที่ ${term}) แล้ว` : `ส่งให้แอดมินอนุมัติแล้ว (${codes.length} วิชา)`, tone: 'ok' })
    } catch (e) {
      tell({ title: 'บันทึกไม่สำเร็จ', text: 'ลองใหม่อีกครั้ง หากยังไม่ได้ให้ตรวจ Firestore rules (' + (e.code || e.message) + ')', tone: 'warn' })
    } finally { setBusy(false) }
  }

  return (
    <div className="stack">
      {mine && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{admin ? 'วิชาที่ฉันสอน' : 'การลงทะเบียนของคุณ'} (ภาคเรียนที่ {term})</b><span className={`pill ${pillOf(mine.status)}`}>{REG_STATUS[mine.status]}</span>
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
            {LEVELS.map((l) => <button key={l} className="chip" aria-pressed={levels.has(l)} onClick={() => toggleLevel(l)}>{l}</button>)}
            {(levels.size > 0 || picked.size > 0) && <button className="btn sm alt" onClick={clearAll}>ล้างที่เลือกทั้งหมด</button>}
          </div>
          <h3>2. เลือกวิชา</h3>
          <div className="tw regtw">
            <table>
              <thead><tr><th></th><th>ชั้น</th><th>รหัส</th><th>รายวิชา</th></tr></thead>
              <tbody>
                {subj.map((c) => <Row key={c.code} c={c} on={picked.has(c.code)} onToggle={togglePick} />)}
                {!subj.length && <tr><td colSpan={4} className="empty">เลือกชั้นก่อน (แสดงเฉพาะวิชาที่แอดมินเปิดสอนแล้ว)</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row"><button className="btn" disabled={busy} onClick={submit}>{admin ? `บันทึกวิชาที่ฉันสอน (${picked.size} วิชา)` : `ส่งให้แอดมินอนุมัติ (${picked.size} วิชา)`}</button></div>
        </div>
      )}
    </div>
  )
}

export default function Registration() {
  const { user } = useAuth()
  const { openYear } = useData()
  const regs = useRegs()
  if (!openYear) return <div className="stack"><div className="card tplbar"><b>ยังไม่กำหนดปีการศึกษา</b> — ลงทะเบียนสอนยังไม่ได้ ดูรายวิชาทั้งหมดได้ด้านล่าง (แอดมินหลักเปิดปีการศึกษาได้ที่เมนู "ปีการศึกษา")</div><Catalog /></div>
  if (!isAdminRole(user.role)) return <TeacherView regs={regs} />
  return (
    <div className="stack">
      <div className="small muted">แอดมินที่สอนด้วย: เลือกวิชาของตัวเองด้านล่าง (อนุมัติให้เองทันที) ส่วนรายการอนุมัติของครูอยู่ถัดลงไป</div>
      <TeacherView regs={regs} />
      <h3>อนุมัติการลงทะเบียนของครู</h3>
      <AdminView regs={regs.filter((r) => r.uid !== user.uid)} />
    </div>
  )
}
