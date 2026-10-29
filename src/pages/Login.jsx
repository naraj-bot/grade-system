import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'

// กล่องเข้าสู่ระบบ (เปิดจากปุ่มในหน้าแรก)
export default function Login({ onClose }) {
  const { login, loginGoogle } = useAuth()
  const saved = (() => { try { return localStorage.getItem('lastUser') || '' } catch { return '' } })()
  const [username, setUsername] = useState(saved)
  const [remember, setRemember] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
    if (ref.current && ref.current.value) document.getElementById('lgpw')?.focus()
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await login(username, password)
      try { remember ? localStorage.setItem('lastUser', username.trim()) : localStorage.removeItem('lastUser') } catch { /* ไม่เป็นไร */ }
    } catch {
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError(''); setBusy(true)
    try {
      await loginGoogle()
    } catch (e) {
      if (e.message === 'NOT_LINKED') setError('บัญชี Google นี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ ให้เข้าด้วยอีเมล/รหัสผ่านก่อน แล้วกด "ผูกบัญชี Google" ที่หน้าแรก')
      else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ (' + (e.code || e.message) + ')')
    } finally { setBusy(false) }
  }

  return (
    <div className="lgov" role="dialog" aria-modal="true" aria-label="เข้าสู่ระบบ" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card" onSubmit={submit}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>เข้าสู่ระบบ</h2>
          <button type="button" className="btn sm alt" onClick={onClose} aria-label="ปิด">ปิด</button>
        </div>
        <label>ชื่อผู้ใช้ (แอดมินหลักใช้อีเมล)
          <input ref={ref} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>รหัสผ่าน
          <input id="lgpw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={remember} onChange={(e) => setRemember(e.target.checked)} /> จำชื่อผู้ใช้ไว้ในเครื่องนี้
        </label>
        {error && <div className="small" style={{ color: 'var(--bad)' }}>{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
        <button type="button" className="btn alt" disabled={busy} onClick={google}>เข้าสู่ระบบด้วย Google (แอดมินที่ผูกบัญชีแล้ว)</button>
        <div className="small muted">เข้าครั้งแรกต้องเปลี่ยนรหัสผ่านก่อนใช้งาน · ลืมรหัสผ่านให้ติดต่อแอดมินหลัก</div>
      </form>
    </div>
  )
}
