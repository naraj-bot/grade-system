import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { DataProvider, useData } from './data'
import Icon from './icons'
import { ROLE_LABEL, isAdminRole } from './lib/constants'
import Landing from './pages/Landing'
import ChangePassword from './pages/ChangePassword'
import AcademicYears from './pages/AcademicYears'
import Users from './pages/Users'
import Home from './pages/Home'
import Students from './pages/Students'
import Catalog from './pages/Catalog'
import Registration from './pages/Registration'
import EnginePage from './pages/EnginePage'
import { engineStop } from './engine/engine'

// เมนูทั้งหมด: [path, ชื่อเต็ม, ชื่อสั้น (แถบล่างบนจอเล็ก), ไอคอน, บทบาทที่เห็น]
const ALL = ['superadmin', 'schooladmin', 'teacher']
const ADMIN = ['superadmin', 'schooladmin']
const E = (page) => () => <EnginePage page={page} />
const PAGES = [
  ['/', 'หน้าแรก', 'หน้าแรก', 'home', ALL, Home],
  ['/years', 'ปีการศึกษา', 'ปีการศึกษา', 'cal', ADMIN, AcademicYears],
  ['/users', 'ผู้ใช้', 'ผู้ใช้', 'users', ADMIN, Users],
  ['/catalog', 'รายวิชา', 'รายวิชา', 'book', ALL, Catalog],
  ['/students', 'นักเรียน', 'นักเรียน', 'users', ADMIN, Students],
  ['/reg', 'ลงทะเบียนสอน', 'ลงทะเบียน', 'reg', ALL, Registration],
  ['/scores', 'กรอกคะแนน', 'คะแนน', 'edit', ALL, E('scores')],
  ['/acts', 'กิจกรรมพัฒนาผู้เรียน', 'กิจกรรม', 'flag', ALL, E('acts')],
  ['/eval', 'ประเมินผู้เรียน', 'ประเมิน', 'star', ALL, E('eval')],
  ['/p5', 'สมุด ปพ.5', 'ปพ.5', 'print', ALL, E('p5')],
  ['/report', 'ใบแจ้งผลการเรียน', 'แจ้งผล', 'book', ALL, E('report')],
  ['/school', 'ตั้งค่าโรงเรียน', 'โรงเรียน', 'school', ADMIN, E('school')],
  ['/sign', 'ลายเซ็นของฉัน', 'ลายเซ็น', 'pen', ALL, E('sign')],
  ['/guide', 'คู่มือการใช้งาน', 'คู่มือ', 'help', ALL, E('guide')],
]
// เมนูหลักที่แสดงบนแถบล่างของจอเล็ก (ที่เหลือเข้าทางปุ่ม "อื่น ๆ")
const MAIN = { superadmin: ['/', '/years', '/users', '/reg'], schooladmin: ['/', '/reg', '/students', '/p5'], teacher: ['/reg', '/scores', '/acts', '/p5'] }

function Shell() {
  const { user, logout } = useAuth()
  const { term, setTerm, openYear } = useData()
  const nav = useNavigate()
  const loc = useLocation()
  const [more, setMore] = useState(false)
  useEffect(() => () => engineStop(), [])
  const pages = PAGES.filter((p) => p[4].includes(user.role))
  const cur = pages.find((p) => p[0] === loc.pathname) || pages[0]
  const main = pages.filter((p) => MAIN[user.role].includes(p[0]))
  const rest = pages.filter((p) => !MAIN[user.role].includes(p[0]))
  const go = (to) => { setMore(false); nav(to) }

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="crest"><img src="/logo.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
          <div><b>ระบบตัดเกรด</b><small>โรงเรียนวัดบางปูน</small></div>
        </div>
        <nav className="nav" aria-label="เมนูหลัก">
          <div className="nd">
            {pages.map(([to, label, , icon]) => (
              <button key={to} onClick={() => go(to)} aria-current={cur[0] === to ? 'page' : undefined}>
                <Icon name={icon} /><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="nm">
            {main.map(([to, , short, icon]) => (
              <button key={to} onClick={() => go(to)} aria-label={short} aria-current={cur[0] === to ? 'page' : undefined}>
                <Icon name={icon} size={24} /><span>{short}</span>
              </button>
            ))}
            {rest.length > 0 && (
              <button onClick={() => setMore(!more)} aria-label="เมนูอื่น ๆ" aria-current={rest.some((p) => p[0] === cur[0]) ? 'page' : undefined}>
                <Icon name="more" size={24} /><span>อื่น ๆ</span>
              </button>
            )}
          </div>
        </nav>
        {more && (
          <div className="more">
            {rest.map(([to, label, , icon]) => (
              <button key={to} onClick={() => go(to)}><Icon name={icon} /><span>{label}</span></button>
            ))}
          </div>
        )}
      </aside>
      <div className="main">
        <div className="top">
          <h2>{cur[1]}</h2>
          <div className="tools">
            {openYear && <span className="pill p-gold">ปีการศึกษา {openYear.year}</span>}
            {[1, 2].map((t) => (
              <button key={t} className="chip" aria-pressed={term === t} onClick={() => setTerm(t)}>ภาคเรียนที่ {t}</button>
            ))}
            <span className="small muted">{user.name} ({ROLE_LABEL[user.role]})</span>
            <button className="btn alt sm" onClick={logout}>ออกจากระบบ</button>
          </div>
        </div>
        <Routes>
          {pages.map(([to, , , , , Page]) => <Route key={to} path={to} element={<Page />} />)}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <footer className="credit">พัฒนาโดย ครูซอสสอนสังคม</footer>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="center">กำลังโหลด...</div>
  if (!user) return <Landing />
  if (user.mustChangePassword) return <ChangePassword />
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}
