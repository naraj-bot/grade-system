import { collection, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { LEVELS, STUDENT_STATUS, nowTh } from './constants'

const chunk = (arr, n = 400) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))

const logRef = () => doc(collection(db, 'studentLog'))
const logData = (by, text) => ({ at: nowTh(), ts: Date.now(), by, text })

export const nextNo = (students, level) =>
  Math.max(0, ...students.filter((s) => s.level === level).map((s) => s.no || 0)) + 1

// เพิ่มนักเรียนหลายคน: items = [{ name, level, no? }]
export async function addStudents(items, students, by, logText) {
  const used = {}
  students.filter((s) => (s.status || 'active') === 'active').forEach((s) => { (used[s.level] ||= new Set()).add(s.no) })
  const max = {}
  LEVELS.forEach((l) => { max[l] = Math.max(0, ...students.filter((s) => s.level === l).map((s) => s.no || 0)) })
  const rows = items.map((x) => {
    let no = x.no
    if (!no || (used[x.level] && used[x.level].has(no))) no = ++max[x.level]
    else max[x.level] = Math.max(max[x.level], no)
    ;(used[x.level] ||= new Set()).add(no)
    return { name: x.name, level: x.level, no, status: 'active', createdAt: Date.now(), ...(x.sid ? { sid: String(x.sid) } : {}) }
  })
  let first = true
  for (const part of chunk(rows)) {
    const b = writeBatch(db)
    part.forEach((r) => b.set(doc(collection(db, 'students')), r))
    if (first) { b.set(logRef(), logData(by, logText)); first = false }
    await b.commit()
  }
  return rows.length
}

export async function updateStudent(old, next, by) {
  const ch = []
  if (old.name !== next.name) ch.push(`ชื่อ "${old.name}" → "${next.name}"`)
  if (old.no !== next.no) ch.push(`เลขที่ ${old.no} → ${next.no}`)
  if (old.level !== next.level) ch.push(`ชั้น ${old.level} → ${next.level}`)
  if ((old.sid || '') !== (next.sid || '')) ch.push(`เลขประจำตัว ${old.sid || '-'} → ${next.sid || '-'}`)
  if ((old.status || 'active') !== next.status) ch.push(`สถานะ ${STUDENT_STATUS[old.status || 'active']} → ${STUDENT_STATUS[next.status]}`)
  if (!ch.length) return false
  const b = writeBatch(db)
  b.update(doc(db, 'students', old.id), { name: next.name, no: next.no, level: next.level, status: next.status, sid: next.sid || '' })
  b.set(logRef(), logData(by, `แก้ไข ${old.name}: ${ch.join(', ')}`))
  await b.commit()
  return true
}

// เลื่อนชั้น: ป.1-5 -> ป.2-6, ม.1-2 -> ม.2-3, ป.6 และ ม.3 -> จบการศึกษา (เฉพาะที่กำลังเรียน)
export function promotionPlan(students) {
  return LEVELS.map((l, i) => ({
    level: l,
    count: students.filter((s) => s.level === l && (s.status || 'active') === 'active').length,
    to: l === 'ป.6' ? 'จบประถมศึกษา' : l === 'ม.3' ? 'จบมัธยมศึกษาตอนต้น' : LEVELS[i + 1],
  }))
}

export async function promoteAll(students, by) {
  const act = students.filter((s) => (s.status || 'active') === 'active')
  const ops = act.map((s) => {
    const i = LEVELS.indexOf(s.level)
    return s.level === 'ป.6' || s.level === 'ม.3'
      ? [s.id, { status: 'grad' }]
      : [s.id, { level: LEVELS[i + 1] }]
  })
  let first = true
  for (const part of chunk(ops)) {
    const b = writeBatch(db)
    part.forEach(([id, patch]) => b.update(doc(db, 'students', id), patch))
    if (first) { b.set(logRef(), logData(by, `เลื่อนชั้นอัตโนมัติ ${act.length} คน`)); first = false }
    await b.commit()
  }
  return act.length
}
