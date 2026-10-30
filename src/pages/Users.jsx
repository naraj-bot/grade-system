import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useAuth } from '../auth'
import { ROLE_LABEL } from '../lib/constants'

async function callApi(body) {
  const token = await auth.currentUser.getIdToken()
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด')
  return data
}

function printSlips(list) {
  const w = window.open('', '_blank')
  if (!w) return alert('อนุญาต pop-up ของเบราว์เซอร์ก่อน')
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const css = `@font-face{font-family:'TH SarabunPSK';src:url(${location.origin}/fonts/THSarabunPSK.ttf)}@font-face{font-family:'TH SarabunPSK';font-weight:700;src:url(${location.origin}/fonts/THSarabunPSK-Bold.ttf)}
@page{size:A4;margin:12mm}body{font-family:'TH SarabunPSK';font-size:16pt;margin:0}.g{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.c{border:1.5px dashed #555;padding:6mm;break-inside:avoid}.c b{font-size:18pt;color:#8c1c1c}.c div{margin:2px 0}.pw{font-size:20pt;font-weight:700;letter-spacing:.06em}`
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ใบรหัสผ่านเริ่มต้น</title><style>${css}</style></head><body><div class="g">${list.map((x) => `<div class="c"><b>ระบบตัดเกรด โรงเรียนวัดบางปูน</b><div>ชื่อ: ${esc(x.name)}</div><div>ชื่อผู้ใช้: <b style="color:#000">${esc(x.username)}</b></div><div>รหัสผ่านเริ่มต้น: <span class="pw">${esc(x.pw)}</span></div><div style="font-size:13pt">เมื่อเข้าครั้งแรกระบบจะให้ตั้งรหัสผ่านใหม่ทันที</div></div>`).join('')}</div></body></html>`)
  w.document.close(); w.onload = () => setTimeout(() => { w.focus(); w.print() }, 400)
}

const genPassword = () => Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 90)

export default function Users() {
  const { user } = useAuth()
  const isSuper = user.role === 'superadmin'
  const [list, setList] = useState([])
  const [form, setForm] = useState({ username: '', name: '', role: 'teacher', tempPassword: genPassword() })
  const [msg, setMsg] = useState('')
  const [slips, setSlips] = useState([])
  const [bulk, setBulk] = useState('')
  const [bulkRole, setBulkRole] = useState('teacher')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = isSuper
      ? collection(db, 'users')
      : query(collection(db, 'users'), where('role', '==', 'teacher'))
    return onSnapshot(q, (s) => setList(s.docs.map((d) => ({ uid: d.id, ...d.data() }))))
  }, [isSuper])

  const create = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await callApi({ action: 'create', ...form })
      setSlips((x) => [...x, { name: form.name, username: form.username, pw: form.tempPassword }])
      setMsg(`สร้างบัญชี ${form.username} แล้ว รหัสเริ่มต้น: ${form.tempPassword} (ต้องเปลี่ยนเมื่อเข้าครั้งแรก)`)
      setForm({ username: '', name: '', role: 'teacher', tempPassword: genPassword() })
    } catch (err) { setMsg(err.message) }
  }

  // เพิ่มหลายคน: บรรทัดละคน "ชื่อผู้ใช้ ชื่อ-สกุล" (คั่นด้วยแท็บ จุลภาค หรือเว้นวรรค) ถ้าไม่ใส่ชื่อผู้ใช้ ระบบตั้งให้เป็น kru01, kru02, ...
  const createBulk = async () => {
    const taken = new Set(list.map((u) => u.username))
    let n = 0
    const nextAuto = () => { let u; do { u = 'kru' + String(++n).padStart(2, '0') } while (taken.has(u)); taken.add(u); return u }
    const rows = bulk.split('\n').map((x) => x.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^([A-Za-z][A-Za-z0-9._-]{2,})\s*[\t,;]\s*(.+)$/) || l.match(/^([A-Za-z][A-Za-z0-9._-]{2,})\s+(.+)$/)
      return m ? { username: m[1].toLowerCase(), name: m[2].trim() } : { username: nextAuto(), name: l }
    })
    if (!rows.length) return
    setBusy(true); setMsg('')
    const ok = [], bad = []
    for (const r of rows) {
      const tempPassword = genPassword()
      try { await callApi({ action: 'create', username: r.username, name: r.name, role: isSuper ? bulkRole : 'teacher', tempPassword }); ok.push({ name: r.name, username: r.username, pw: tempPassword }) }
      catch (err) { bad.push(`${r.username} (${err.message})`) }
    }
    setSlips((x) => [...x, ...ok])
    setMsg(`สร้างบัญชีแล้ว ${ok.length} จาก ${rows.length} คน${bad.length ? ' · ไม่สำเร็จ: ' + bad.join(', ') : ''}${ok.length ? ' · กด "พิมพ์ใบรหัสผ่านเริ่มต้น" เพื่อเก็บรหัสไปแจกครู' : ''}`)
    if (!bad.length) setBulk('')
    setBusy(false)
  }

  const reset = async (u) => {
    const tempPassword = genPassword()
    try {
      await callApi({ action: 'reset', uid: u.uid, tempPassword })
      setSlips((x) => [...x, { name: u.name, username: u.username, pw: tempPassword }])
      setMsg(`รีเซ็ตรหัสของ ${u.name} แล้ว รหัสใหม่: ${tempPassword}`)
    } catch (err) { setMsg(err.message) }
  }

  return (
    <div className="stack">
      <form className="card row" onSubmit={create}>
        <input placeholder="ชื่อผู้ใช้" value={form.username} required
          onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder="ชื่อ-สกุล" value={form.name} required
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {isSuper && (
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="teacher">ครูผู้สอน</option>
            <option value="schooladmin">แอดมินโรงเรียน</option>
          </select>
        )}
        <input value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} />
        <button className="btn">เพิ่มผู้ใช้</button>
      </form>
      <details className="card">
        <summary><b>เพิ่มหลายคนพร้อมกัน</b></summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="small muted">พิมพ์บรรทัดละคน เช่น <code>somchai  ครูสมชาย ใจดี</code> หรือใส่แค่ชื่อ-สกุล ระบบจะตั้งชื่อผู้ใช้ให้ (kru01, kru02, ...) และสุ่มรหัสผ่านเริ่มต้นให้ทุกคน</div>
          <textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'somchai  ครูสมชาย ใจดี\nsomying  ครูสมหญิง รักเรียน\nครูมานะ ตั้งใจ'} />
          <div className="row">
            {isSuper && <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}><option value="teacher">ครูผู้สอน</option><option value="schooladmin">แอดมินโรงเรียน</option></select>}
            <button className="btn" disabled={busy || !bulk.trim()} onClick={createBulk}>{busy ? 'กำลังสร้าง...' : 'สร้างบัญชีทั้งหมด'}</button>
          </div>
        </div>
      </details>
      {msg && <p className="notice">{msg}</p>}
      {slips.length > 0 && (
        <div className="row">
          <button className="btn alt sm" onClick={() => printSlips(slips)}>พิมพ์ใบรหัสผ่านเริ่มต้น ({slips.length} ใบ)</button>
          <button className="btn alt sm" onClick={() => setSlips([])}>ล้างรายการ</button>
          <span className="small muted">รหัสแสดงได้เฉพาะตอนสร้าง/รีเซ็ตเท่านั้น พิมพ์เก็บไว้แจกครู</span>
        </div>
      )}
      <div className="tw"><table>
        <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-สกุล</th><th>บทบาท</th><th></th></tr></thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.uid}>
              <td>{u.username}</td><td>{u.name}</td><td>{ROLE_LABEL[u.role] || u.role}</td>
              <td>{isSuper && u.role !== 'superadmin' && <button className="btn sm alt" onClick={() => reset(u)}>รีเซ็ตรหัสผ่าน</button>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
