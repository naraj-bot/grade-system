import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../auth'
import { isAdminRole } from '../lib/constants'

const KEEP = 45 * 24 * 3600 * 1000
const seenKey = (uid) => 'notifSeen_' + uid
const readSeen = (uid) => { try { return Number(localStorage.getItem(seenKey(uid))) || 0 } catch { return 0 } }

// กระดิ่งแจ้งเตือน: ถึงตัวเอง และถึง 'admins' (เฉพาะแอดมิน)
export default function Bell() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [mine, setMine] = useState([])
  const [adm, setAdm] = useState([])
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => readSeen(user.uid))
  const box = useRef(null)

  useEffect(() => {
    const map = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))
    const u1 = onSnapshot(query(collection(db, 'notifications'), where('to', '==', user.uid)), (s) => setMine(map(s)), () => {})
    const u2 = isAdminRole(user.role)
      ? onSnapshot(query(collection(db, 'notifications'), where('to', '==', 'admins')), (s) => setAdm(map(s)), () => {})
      : () => {}
    return () => { u1(); u2() }
  }, [user.uid, user.role])

  useEffect(() => {
    if (!open) return
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])

  const list = useMemo(() => {
    const cut = Date.now() - KEEP
    return [...mine, ...adm].filter((n) => n.ts > cut && n.from !== user.uid).sort((a, b) => b.ts - a.ts).slice(0, 30)
  }, [mine, adm, user.uid])
  const unseen = list.filter((n) => n.ts > seen).length

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (!next && list.length) { const t = list[0].ts; setSeen(t); try { localStorage.setItem(seenKey(user.uid), String(t)) } catch { /* ไม่เป็นไร */ } }
    if (next && list.length) { /* ปิดแล้วจึงถือว่าอ่าน */ }
  }
  const markAll = () => { if (list.length) { const t = list[0].ts; setSeen(t); try { localStorage.setItem(seenKey(user.uid), String(t)) } catch { /* ไม่เป็นไร */ } } }
  const fmt = (t) => new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="bell" ref={box}>
      <button className="btn alt sm" onClick={toggle} aria-label={`การแจ้งเตือน ${unseen} รายการใหม่`} aria-expanded={open}>
        🔔{unseen > 0 && <b className="bdot">{unseen > 9 ? '9+' : unseen}</b>}
      </button>
      {open && (
        <div className="bpanel" role="dialog" aria-label="การแจ้งเตือน">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>การแจ้งเตือน</b>
            <button className="btn sm alt" onClick={markAll}>อ่านแล้วทั้งหมด</button>
          </div>
          {list.map((n) => (
            <button key={n.id} className={`bitem ${n.ts > seen ? 'new' : ''}`} onClick={() => { setOpen(false); markAll(); if (n.link) nav('/' + n.link) }}>
              <span>{n.text}</span><small className="muted">{fmt(n.ts)}</small>
            </button>
          ))}
          {!list.length && <div className="small muted">ยังไม่มีการแจ้งเตือน</div>}
        </div>
      )}
    </div>
  )
}
