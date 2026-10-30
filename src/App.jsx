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
import Backup from './pages/Backup'
import Registration from './pages/Registration'
import EnginePage from './pages/EnginePage'
import Bell from './components/Bell'
import { engineStop } from './engine/engine'

// เมนูทั้งหมด: [path, ชื่อเต็ม, ชื่อสั้น (แถบล่างบนจอเล็ก), ไอคอน, บทบาทที่เห็น]
const ALL = ['superadmin', 'schooladmin', 'teacher']
const ADMIN = ['superadmin', 'schooladmin']
const E = (page) => () => <EnginePage page={page} />
const GROUPS = ['ภาพรวม', 'ข้อมูลหลัก', 'การสอน', 'เอกสาร', 'ตั้งค่า']
const PAGES = [
  ['/', 'ภาพรวม', 'หน้าแรก', 'home', ALL, Home, 'ภาพรวม'],
  ['/guide', 'คู่มือเริ่มใช้งาน', 'คู่มือ', 'help', ALL, E('guide'), 'ภาพรวม'],
  ['/years', 'ปีการศึกษา', 'ปีการศึกษา', 'cal', ADMIN, AcademicYears, 'ข้อมูลหลัก'],
  ['/users', 'บัญชีครู', 'ผู้ใช้', 'users', ADMIN, Users, 'ข้อมูลหลัก'],
  ['/students', 'รายชื่อนักเรียน', 'นักเรียน', 'users', ADMIN, Students, 'ข้อมูลหลัก'],
  ['/catalog', 'รายวิชา', 'รายวิชา', 'book', ALL, Catalog, 'ข้อมูลหลัก'],
  ['/reg', 'ลงทะเบียนวิชาสอน', 'ลงทะเบียน', 'reg', ALL, Registration, 'การสอน'],
  ['/scores', 'บันทึกคะแนน', 'คะแนน', 'edit', ALL, E('scores'), 'การสอน'],
  ['/acts', 'กิจกรรมพัฒนาผู้เรียน', 'กิจกรรม', 'flag', ALL, E('acts'), 'การสอน'],
  ['/eval', 'ประเมินคุณลักษณะ', 'ประเมิน', 'star', ALL, E('eval'), 'การสอน'],
  ['/p5', 'สมุด ปพ.5', 'ปพ.5', 'print', ALL, E('p5'), 'เอกสาร'],
  ['/report', 'ใบแจ้งผลการเรียน', 'แจ้งผล', 'book', ALL, E('report'), 'เอกสาร'],
  ['/summary', 'สรุปผลรายห้อง', 'สรุปห้อง', 'book', ALL, E('summary'), 'เอกสาร'],
  ['/school', 'ตั้งค่าโรงเรียน', 'โรงเรียน', 'school', ADMIN, E('school'), 'ตั้งค่า'],
  ['/backup', 'สำรองข้อมูล', 'สำรอง', 'down', ADMIN, Backup, 'ตั้งค่า'],
  ['/sign', 'ลายเซ็นของฉัน', 'ลายเซ็น', 'pen', ALL, E('sign'), 'ตั้งค่า'],
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
          <div className="crest"><img src="/logo.png" alt="" /></div>
          <div><b>ระบบตัดเกรด</b><small>โรงเรียนวัดบางปูน</small></div>
        </div>
        {openYear && <div className="yc"><span>ปีการศึกษา <b>{openYear.year}</b></span><span className="yt">ภาคเรียนที่ {term}</span></div>}
        <nav className="nav" aria-label="เมนูหลัก">
          <div className="nd">
            {GROUPS.map((g) => {
              const items = pages.filter((p) => p[6] === g)
              if (!items.length) return null
              return (
                <div className="ng" key={g}>
                  <div className="gl">{g}</div>
                  {items.map(([to, label, , icon]) => (
                    <button key={to} onClick={() => go(to)} aria-current={cur[0] === to ? 'page' : undefined}>
                      <Icon name={icon} /><span>{label}</span>
                    </button>
                  ))}
                </div>
              )
            })}
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
        <div className="uf">
          <div className="av" aria-hidden="true">{(user.name || '?').replace(/^(นาย|นางสาว|นาง|ครู)/, '').trim().charAt(0)}</div>
          <div className="un"><b>{user.name}</b><small>{ROLE_LABEL[user.role]}</small></div>
          <button className="lo" onClick={logout} aria-label="ออกจากระบบ" title="ออกจากระบบ"><Icon name="out" size={18} /></button>
        </div>
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
            <Bell />
            <span className="topuser small">{user.name} ({ROLE_LABEL[user.role]})</span>
            <button className="btn alt sm topuser" onClick={logout}>ออกจากระบบ</button>
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
