import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useData } from '../data'
import { useRegs } from '../lib/useRegs'
import { isAdminRole } from '../lib/constants'

export default function Home() {
  const { user } = useAuth()
  const { openYear, term, activeStudents, catalog, openSet } = useData()
  const regs = useRegs()
  const nav = useNavigate()
  const admin = isAdminRole(user.role)
  const mine = regs.filter((r) => r.term === term)
  const pending = regs.filter((r) => r.term === term && r.status === 'pending').length
  const approved = mine.filter((r) => r.status === 'ok').reduce((n, r) => n + r.codes.length, 0)
  const back = mine.filter((r) => r.status === 'back')

  if (!openYear) {
    return (
      <div className="card stack">
        <h3>ยังไม่มีปีการศึกษาที่เปิดใช้งาน</h3>
        <p className="muted" style={{ margin: 0 }}>
          {user.role === 'superadmin' ? 'เริ่มจากเปิดปีการศึกษาใหม่ในเมนู "ปีการศึกษา"' : 'รอแอดมินหลักเปิดปีการศึกษา'}
        </p>
        {user.role === 'superadmin' && <div><button className="btn" onClick={() => nav('/years')}>ไปที่ปีการศึกษา</button></div>}
      </div>
    )
  }

  return (
    <>
      <div className="grid">
        <div className="card kpi"><b>{activeStudents.length}</b>นักเรียนที่กำลังเรียน</div>
        <div className="card kpi"><b>{openSet.size}</b>รายวิชาที่เปิดสอน (จาก {catalog.length})</div>
        {admin
          ? <div className="card kpi"><b>{pending}</b>รออนุมัติลงทะเบียนสอน</div>
          : <div className="card kpi"><b>{approved}</b>วิชาที่ได้รับอนุมัติแล้ว</div>}
      </div>
      <div className="card stack">
        <h3>ปีการศึกษา {openYear.year} ภาคเรียนที่ {term}</h3>
        <p className="muted" style={{ margin: 0 }}>
          {admin
            ? 'เริ่มจากเพิ่มนักเรียน เปิดรายวิชา แล้วอนุมัติการลงทะเบียนสอนของครู'
            : 'ลงทะเบียนวิชาที่สอน รอแอดมินอนุมัติ แล้วจึงกรอกคะแนนได้'}
        </p>
        <div className="row">
          <button className="btn" onClick={() => nav('/reg')}>{admin ? 'ตรวจการลงทะเบียน' : 'ลงทะเบียนสอน'}</button>
          {admin && <button className="btn alt" onClick={() => nav('/students')}>นักเรียน</button>}
        </div>
      </div>
      {!admin && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>สิ่งที่ต้องทำ</h3>
            <span className={`pill ${back.length ? 'p-warn' : 'p-good'}`}>{back.length ? `${back.length} รายการ` : 'ครบแล้ว'}</span>
          </div>
          {back.map((r) => (
            <div className="row" style={{ justifyContent: 'space-between' }} key={r.id}>
              <span className="small">แอดมินส่งการลงทะเบียนกลับ: {r.msg}</span>
              <button className="btn sm alt" onClick={() => nav('/reg')}>แก้ไข</button>
            </div>
          ))}
          {!back.length && <div className="small muted">ไม่มีงานค้างในภาคเรียนนี้</div>}
        </div>
      )}
    </>
  )
}
