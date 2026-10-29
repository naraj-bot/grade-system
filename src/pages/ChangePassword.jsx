import { useState } from 'react'
import { useAuth } from '../auth'

export default function ChangePassword() {
  const { changePassword, logout } = useAuth()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (p1.length < 6) return setError('รหัสผ่านต้องยาวอย่างน้อย 6 ตัว')
    if (p1 !== p2) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
    try {
      await changePassword(p1)
    } catch {
      setError('เปลี่ยนรหัสผ่านไม่สำเร็จ ลองออกจากระบบแล้วเข้าใหม่อีกครั้ง')
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h2>ตั้งรหัสผ่านใหม่</h2>
        <p>เข้าสู่ระบบครั้งแรก กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน</p>
        <label>รหัสผ่านใหม่
          <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} required />
        </label>
        <label>ยืนยันรหัสผ่านใหม่
          <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn">บันทึก</button>
        <button type="button" className="btn alt" onClick={logout}>ออกจากระบบ</button>
      </form>
    </div>
  )
}
