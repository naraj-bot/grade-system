import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'

// กล่องเข้าสู่ระบบ (เปิดจากปุ่มในหน้าแรก)
export default function Login({ onClose }) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await login(username, password)
    } catch {
      setError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    } finally {
      setBusy(false)
    }
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
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="small" style={{ color: 'var(--bad)' }}>{error}</div>}
        <button className="btn" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}</button>
        <div className="small muted">เข้าครั้งแรกต้องเปลี่ยนรหัสผ่านก่อนใช้งาน · ลืมรหัสผ่านให้ติดต่อแอดมินหลัก</div>
      </form>
    </div>
  )
}
