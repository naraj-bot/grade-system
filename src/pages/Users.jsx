import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db, auth } from '../firebase'
import { useAuth } from '../auth'
import { ROLE_LABEL } from '../lib/constants'
import { ask, tell } from '../lib/dialog'
import { copyText, credText, saveCredImage } from '../lib/credCard'

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
  if (!w) return tell({ title: 'เบราว์เซอร์บล็อกหน้าต่างพิมพ์', text: 'อนุญาต pop-up ของเว็บนี้ในเบราว์เซอร์ แล้วกดอีกครั้ง', tone: 'warn' })
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const css = `@font-face{font-family:'TH SarabunPSK';src:url(${location.origin}/fonts/THSarabunPSK.ttf)}@font-face{font-family:'TH SarabunPSK';font-weight:700;src:url(${location.origin}/fonts/THSarabunPSK-Bold.ttf)}
@page{size:A4;margin:12mm}body{font-family:'TH SarabunPSK';font-size:16pt;margin:0}.g{display:grid;grid-template-columns:1fr 1fr;gap:8mm}
.c{border:1.5px dashed #555;padding:6mm;break-inside:avoid}.c b{font-size:18pt;color:#8c1c1c}.c div{margin:2px 0}.pw{font-size:20pt;font-weight:700;letter-spacing:.06em}`
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ใบรหัสผ่านเริ่มต้น</title><style>${css}</style></head><body><div class="g">${list.map((x) => `<div class="c"><b>ระบบตัดเกรด โรงเรียนวัดบางปูน</b><div>ชื่อ: ${esc(x.name)}</div><div>ชื่อผู้ใช้: <b style="color:#000">${esc(x.username)}</b></div><div>รหัสผ่านเริ่มต้น: <span class="pw">${esc(x.pw)}</span></div><div style="font-size:13pt">เมื่อเข้าครั้งแรกระบบจะให้ตั้งรหัสผ่านใหม่ทันที</div></div>`).join('')}</div></body></html>`)
  w.document.close(); w.onload = () => setTimeout(() => { w.focus(); w.print() }, 400)
}

// กล่องแสดงชื่อผู้ใช้/รหัสผ่านหลังสร้างหรือรีเซ็ต: คัดลอกได้ บันทึกเป็นภาพรายบุคคลได้
function CredModal({ list, title, onClose }) {
  const [done, setDone] = useState('')
  const flash = (t) => { setDone(t); setTimeout(() => setDone(''), 1800) }
  const cp = async (t, label) => flash((await copyText(t)) ? `คัดลอก${label}แล้ว` : 'คัดลอกไม่ได้ ลองเลือกข้อความเอง')
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="dlg-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlg wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dlg-ic"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg></div>
        <h3>{title}</h3>
        <p>รหัสผ่านแสดงได้เฉพาะตอนนี้เท่านั้น คัดลอกหรือบันทึกเป็นภาพไว้ก่อนปิด · ผู้ใช้ต้องตั้งรหัสใหม่เมื่อเข้าครั้งแรก</p>
        <div className="cred-list">
          {list.map((c) => (
            <div className="cred" key={c.username}>
              <div className="cn">{c.name}</div>
              <div className="cv"><span>ชื่อผู้ใช้</span><b>{c.username}</b><button className="mini" onClick={() => cp(c.username, 'ชื่อผู้ใช้')}>คัดลอก</button></div>
              <div className="cv"><span>รหัสผ่าน</span><b>{c.pw}</b><button className="mini" onClick={() => cp(c.pw, 'รหัสผ่าน')}>คัดลอก</button></div>
              <div className="ca">
                <button className="mini solid" onClick={() => cp(credText(c), 'ข้อความ')}>คัดลอกทั้งหมด</button>
                <button className="mini solid" onClick={async () => flash((await saveCredImage(c)) ? 'บันทึกภาพแล้ว' : 'บันทึกภาพไม่สำเร็จ')}>บันทึกเป็นภาพ</button>
              </div>
            </div>
          ))}
        </div>
        <div className="dlg-bt">
          {list.length > 1 && <button className="dlg-c" onClick={() => cp(list.map(credText).join('\n\n'), `ข้อความ ${list.length} คน`)}>คัดลอกทั้งหมด {list.length} คน</button>}
          <button className="dlg-o" onClick={onClose}>เรียบร้อย</button>
        </div>
        <div className="cred-flash" aria-live="polite">{done}</div>
      </div>
    </div>
  )
}

// กล่องแก้ไขชื่อ/บทบาท
function EditModal({ u, onSave, onClose }) {
  const [name, setName] = useState(u.name)
  const [role, setRole] = useState(u.role)
  return (
    <div className="dlg-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dlg" style={{ textAlign: 'left' }} onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim(), role }) }}>
        <h3 style={{ textAlign: 'center', marginBottom: 12 }}>แก้ไขบัญชี {u.username}</h3>
        <label className="ed">ชื่อ-สกุล<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        <label className="ed">บทบาท
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="teacher">ครูผู้สอน</option>
            <option value="schooladmin">แอดมินโรงเรียน</option>
          </select>
        </label>
        <div className="dlg-bt"><button type="button" className="dlg-c" onClick={onClose}>ยกเลิก</button><button className="dlg-o">บันทึก</button></div>
      </form>
    </div>
  )
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
  const [cred, setCred] = useState(null)
  const [editing, setEditing] = useState(null)

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
      const c = { name: form.name, username: form.username.trim().toLowerCase(), pw: form.tempPassword }
      setSlips((x) => [...x, c])
      setCred({ title: `สร้างบัญชี ${c.username} แล้ว`, list: [c] })
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
    if (ok.length) setCred({ title: `สร้างบัญชีแล้ว ${ok.length} จาก ${rows.length} คน`, list: ok })
    setMsg(bad.length ? `ไม่สำเร็จ ${bad.length} คน: ${bad.join(', ')}` : '')
    if (!bad.length) setBulk('')
    setBusy(false)
  }

  const reset = async (u) => {
    const tempPassword = genPassword()
    try {
      await callApi({ action: 'reset', uid: u.uid, tempPassword })
      const c = { name: u.name, username: u.username, pw: tempPassword }
      setSlips((x) => [...x, c])
      setCred({ title: `รีเซ็ตรหัสผ่านของ ${u.name} แล้ว`, list: [c] })
    } catch (err) { setMsg(err.message) }
  }

  const saveEdit = async (patch) => {
    const u = editing; setEditing(null)
    try { await callApi({ action: 'update', uid: u.uid, ...patch }); setMsg(`บันทึกข้อมูล ${patch.name} แล้ว`) } catch (err) { tell({ title: 'บันทึกไม่สำเร็จ', text: err.message, tone: 'warn' }) }
  }
  const toggleActive = async (u) => {
    const on = u.active === false
    if (!on && !(await ask({ title: `ปิดใช้งานบัญชี ${u.username} ?`, text: `${u.name} จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานอีกครั้ง ข้อมูลที่เคยกรอกไม่หาย`, ok: 'ปิดใช้งาน', danger: true }))) return
    try { await callApi({ action: 'setActive', uid: u.uid, active: on }); setMsg(`${on ? 'เปิด' : 'ปิด'}ใช้งานบัญชี ${u.username} แล้ว`) } catch (err) { tell({ title: 'ทำรายการไม่สำเร็จ', text: err.message, tone: 'warn' }) }
  }
  const remove = async (u) => {
    if (!(await ask({ title: `ลบบัญชี ${u.username} ?`, text: `ลบ ${u.name} ออกจากระบบถาวร เข้าสู่ระบบไม่ได้อีก (คะแนนที่เคยกรอกยังอยู่) ถ้าแค่พักการใช้งาน ให้เลือก "ปิดใช้งาน" แทน`, ok: 'ลบบัญชี', danger: true }))) return
    try { await callApi({ action: 'delete', uid: u.uid }); setMsg(`ลบบัญชี ${u.username} แล้ว`) } catch (err) { tell({ title: 'ลบไม่สำเร็จ', text: err.message, tone: 'warn' }) }
  }
  const askReset = async (u) => {
    if (await ask({ title: `รีเซ็ตรหัสผ่านของ ${u.name} ?`, text: 'ระบบจะสุ่มรหัสใหม่ให้ และให้ตั้งรหัสใหม่เมื่อเข้าครั้งแรก รหัสเดิมใช้ไม่ได้ทันที', ok: 'รีเซ็ตรหัสผ่าน' })) reset(u)
  }

  return (
    <div className="stack">
      {cred && <CredModal list={cred.list} title={cred.title} onClose={() => setCred(null)} />}
      {editing && <EditModal u={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}
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
        <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ-สกุล</th><th>บทบาท</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>
          {[...list].sort((x, y) => String(x.username).localeCompare(String(y.username), 'en', { numeric: true })).map((u) => (
            <tr key={u.uid} style={u.active === false ? { opacity: 0.6 } : undefined}>
              <td>{u.username}</td><td>{u.name}</td><td>{ROLE_LABEL[u.role] || u.role}</td>
              <td><span className={`pill ${u.active === false ? 'p-warn' : 'p-good'}`}>{u.active === false ? 'ปิดใช้งาน' : 'ใช้งาน'}</span></td>
              <td>{isSuper && u.role !== 'superadmin' && (
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm alt" onClick={() => askReset(u)}>รีเซ็ตรหัสผ่าน</button>
                  <button className="btn sm alt" onClick={() => setEditing(u)}>แก้ไข</button>
                  <button className="btn sm alt" onClick={() => toggleActive(u)}>{u.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button>
                  <button className="btn sm danger" onClick={() => remove(u)}>ลบ</button>
                </div>
              )}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
