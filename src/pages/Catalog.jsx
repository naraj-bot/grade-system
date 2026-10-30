import { useState } from 'react'
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { useData } from '../data'
import { LEVELS, isAdminRole, isPri } from '../lib/constants'

// รายวิชา: คลังมีเฉพาะรหัส/ชื่อ แอดมินเลือกเปิดสอนของปีการศึกษา ครูเห็นอย่างเดียว
export default function Catalog() {
  const { user } = useAuth()
  const { openYear, term, termCatalog, openSet } = useData()
  const admin = isAdminRole(user.role)
  const [level, setLevel] = useState('ป.1')
  const [busy, setBusy] = useState(false)
  const rows = termCatalog.filter((c) => c.level === level)

  const apply = async (codes, on) => {
    if (!openYear || busy) return
    setBusy(true)
    try {
      const b = writeBatch(db)
      codes.forEach((code) => {
        const ref = doc(db, 'subjectOpen', `${openYear.year}_${code}`)
        if (on) b.set(ref, { year: openYear.year, code })
        else b.delete(ref)
      })
      await b.commit()
    } finally { setBusy(false) }
  }

  const allOn = rows.length > 0 && rows.every((c) => openSet.has(c.code))

  return (
    <div className="stack">
      {!openYear && <div className="card tplbar"><b>ยังไม่กำหนดปีการศึกษา</b> — ดูรายวิชาได้ แต่เปิดสอนหรือเลือกวิชาไม่ได้ (แอดมินหลักเปิดปีการศึกษาได้ที่เมนู "ปีการศึกษา")</div>}
      <div className="row">
        {LEVELS.map((l) => <button key={l} className="chip" aria-pressed={level === l} onClick={() => setLevel(l)}>{l}</button>)}
      </div>
      <div className="row">
        <span className="muted small">{isPri(level) ? 'ประถมเก็บทั้งปี (ภาคเรียนละ 50 รวม 100)' : `ภาคเรียนที่ ${term}`}</span>
        {admin && <button className="btn sm alt" disabled={busy || !openYear} onClick={() => apply(rows.map((c) => c.code), !allOn)}>
          {allOn ? 'ยกเลิกทั้งชั้นนี้' : 'เลือกทั้งหมดของชั้นนี้'}
        </button>}
      </div>
      <div className="tw">
        <table>
          <thead><tr>{admin && <th>เปิดสอน</th>}<th>รหัสวิชา</th><th>รายวิชา</th>{!admin && <th>สถานะ</th>}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.code}>
                {admin && <td><input type="checkbox" checked={openSet.has(c.code)} disabled={busy || !openYear}
                  aria-label={`เปิดสอน ${c.name}`} onChange={(e) => apply([c.code], e.target.checked)} /></td>}
                <td>{c.code}</td><td>{c.name}</td>
                {!admin && <td>{openSet.has(c.code) ? <span className="pill p-good">เปิดสอน</span> : <span className="pill p-warn">ยังไม่เปิด</span>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
