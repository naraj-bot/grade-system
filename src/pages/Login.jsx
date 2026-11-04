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
  // ปุ่ม Google ซ่อนไว้ แสดงเมื่อเปิดลิงก์ ...#admin หรือแตะโลโก้ 5 ครั้ง
  const [taps, setTaps] = useState(0)
  const showG = taps >= 5 || (typeof location !== 'undefined' && location.hash === '#admin')

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
    } catch (e) {
      setError(e && e.code === 'auth/user-disabled' ? 'บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบของโรงเรียน' : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
  }

  // เบราว์เซอร์ในแอป (LINE, Facebook, Messenger, Instagram ฯลฯ) แยกที่เก็บข้อมูลของหน้าต่างล็อกอิน Google
  // ทำให้ Firebase ขึ้น "missing initial state" → แนะนำให้เปิดใน Safari/Chrome แทน
  const inApp = /Line\/|FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger|; wv\)|GSA\//i.test(navigator.userAgent || '')
  const openOutside = () => {
    const u = new URL(location.href)
    if (/Line\//i.test(navigator.userAgent)) { u.searchParams.set('openExternalBrowser', '1'); location.href = u.toString(); return }
    try { navigator.clipboard?.writeText(location.origin) } catch { /* ไม่เป็นไร */ }
    setError('คัดลอกลิงก์แล้ว เปิดแอป Safari หรือ Chrome แล้ววางลิงก์เพื่อเข้าสู่ระบบด้วย Google')
  }
  const google = async () => {
    if (inApp) { setError('เข้าสู่ระบบด้วย Google จากเบราว์เซอร์ในแอปนี้ไม่ได้ กด "เปิดใน Safari/Chrome" ด้านล่าง หรือเข้าด้วยชื่อผู้ใช้และรหัสผ่านแทน'); return }
    setError(''); setBusy(true)
    try {
      await loginGoogle()
    } catch (e) {
      if (e.message === 'NOT_LINKED') setError('บัญชี Google นี้ยังไม่ได้ผูกกับผู้ใช้ในระบบ ให้เข้าด้วยอีเมล/รหัสผ่านก่อน แล้วกด "ผูกบัญชี Google" ที่หน้าแรก')
      else if (e.code === 'auth/popup-blocked') setError('เบราว์เซอร์บล็อกหน้าต่างล็อกอิน Google อนุญาตป๊อปอัปสำหรับเว็บนี้ แล้วลองอีกครั้ง')
      else if (e.code === 'auth/web-storage-unsupported' || /initial state/i.test(e.message || '')) setError('เบราว์เซอร์นี้ไม่รองรับการเข้าสู่ระบบด้วย Google (มักเกิดในเบราว์เซอร์ของแอป LINE/Facebook หรือโหมดส่วนตัว) โปรดเปิดใน Safari หรือ Chrome')
      else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') setError('เข้าสู่ระบบด้วย Google ไม่สำเร็จ (' + (e.code || e.message) + ')')
    } finally { setBusy(false) }
  }

  return (
    <div className="lgov" role="dialog" aria-modal="true" aria-label="เข้าสู่ระบบ" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card" onSubmit={submit}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <img src="/logo.png" alt="" onClick={() => setTaps((n) => n + 1)} style={{ height: 44, width: 'auto', cursor: 'default', userSelect: 'none', WebkitUserDrag: 'none' }} draggable={false} />
            <h2 style={{ margin: 0 }}>เข้าสู่ระบบ</h2>
          </div>
          <button type="button" className="btn sm alt" onClick={onClose} aria-label="ปิด">ปิด</button>
        </div>
        <label>ชื่อผู้ใช้
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
        {showG && <button type="button" className="btn alt" disabled={busy} onClick={google}>เข้าสู่ระบบด้วย Google</button>}
        {showG && inApp && <button type="button" className="btn alt" onClick={openOutside}>เปิดใน Safari/Chrome</button>}
        <div className="small muted">เข้าครั้งแรกต้องเปลี่ยนรหัสผ่านก่อนใช้งาน · ลืมรหัสผ่านให้ติดต่อผู้ดูแลระบบของโรงเรียน</div>
      </form>
    </div>
  )
}
