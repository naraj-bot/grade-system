// อ่านรายชื่อนักเรียนจากไฟล์ .xlsx / .csv (ไม่พึ่งไลบรารีภายนอก)
import { LEVELS } from './constants'

export function normLevel(v) {
  v = String(v || '').replace(/\s/g, '')
  let m = v.match(/^(ป|ม)\.?(\d)$/)
  if (m) return `${m[1]}.${m[2]}`
  m = v.match(/ประถม(?:ศึกษา)?(?:ปีที่)?(\d)/)
  if (m) return `ป.${m[1]}`
  m = v.match(/มัธยม(?:ศึกษา)?(?:ปีที่)?(\d)/)
  if (m) return `ม.${m[1]}`
  return v
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '')
  const first = text.split(/\r?\n/)[0] || ''
  const d = [['\t', (first.match(/\t/g) || []).length], [',', (first.match(/,/g) || []).length], [';', (first.match(/;/g) || []).length]]
    .sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let r = [], c = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch
    } else if (ch === '"') q = true
    else if (ch === d) { r.push(c); c = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      r.push(c); rows.push(r); r = []; c = ''
    } else c += ch
  }
  if (c !== '' || r.length) { r.push(c); rows.push(r) }
  return rows
}

async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw')
  const w = ds.writable.getWriter()
  w.write(u8); w.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

export async function readXlsx(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf)
  let e = -1
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { e = i; break }
  }
  if (e < 0) throw new Error('ไม่ใช่ไฟล์ .xlsx')
  const n = dv.getUint16(e + 10, true)
  let p = dv.getUint32(e + 16, true)
  const files = {}
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true)
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true)
    const lo = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl))
    files[name] = { meth, cs, lo }
    p += 46 + nl + el + cl
  }
  const get = async (nm) => {
    const f = files[nm]
    if (!f) return null
    const o = f.lo
    const ds = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true)
    const raw = u8.subarray(ds, ds + f.cs)
    return new TextDecoder().decode(f.meth === 0 ? raw : await inflateRaw(raw))
  }
  const dp = new DOMParser()
  const xml = (t) => dp.parseFromString(t, 'application/xml')
  const ss = []
  const sst = await get('xl/sharedStrings.xml')
  if (sst) xml(sst).querySelectorAll('si').forEach((si) => ss.push([...si.querySelectorAll('t')].map((t) => t.textContent).join('')))
  const sn = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1]) - parseInt(b.match(/(\d+)\.xml/)[1]))[0]
  if (!sn) throw new Error('ไม่พบแผ่นงานในไฟล์')
  const sh = xml(await get(sn))
  const rows = []
  sh.querySelectorAll('sheetData > row').forEach((rw) => {
    const row = []
    rw.querySelectorAll('c').forEach((c) => {
      const ref = c.getAttribute('r') || ''
      const col = [...ref.replace(/\d+/, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
      const t = c.getAttribute('t')
      let v = ''
      if (t === 's') v = ss[+(c.querySelector('v') || {}).textContent] || ''
      else if (t === 'inlineStr') v = [...c.querySelectorAll('t')].map((x) => x.textContent).join('')
      else { const x = c.querySelector('v'); v = x ? x.textContent : '' }
      row[col] = v
    })
    rows.push(row)
  })
  return rows
}

// แปลงตารางดิบเป็นรายชื่อ: คืน { rows:[{name,no,level,st}], hdr }
// st: 'ok' | 'dup' (ชื่อซ้ำกับคนที่กำลังเรียน) | 'level' (ชั้นไม่ถูกต้อง)
export function mapRows(raw, defaultLevel, activeStudents) {
  let rows = raw.map((r) => Array.from({ length: r.length }, (_, i) => String(r[i] == null ? '' : r[i]).trim()))
    .filter((r) => r.some((x) => x))
  const HEAD = /^(เลขประจำตัว(นักเรียน)?|รหัสนักเรียน|เลขที่|ลำดับ|ที่|คำนำหน้า|ชื่อ|ชื่อ\s*-?\s*(นาม)?สกุล|ชื่อจริง|นามสกุล|สกุล|ชั้น|ระดับชั้น|ชั้นเรียน|เลขประจำตัว.*)$/
  const hi = rows.slice(0, 8).findIndex((r) => r.filter((x) => HEAD.test(x)).length >= 2 || r.some((x) => /^ชื่อ\s*-?\s*(นาม)?สกุล$/.test(x)))
  const M = {}
  let body = rows, hdr = false
  if (hi >= 0) {
    hdr = true
    body = rows.slice(hi + 1)
    rows[hi].forEach((h, i) => {
      if (/คำนำหน้า/.test(h)) M.pre = i
      else if (/ชื่อ.*สกุล/.test(h)) M.full = i
      else if (/นามสกุล|^สกุล$/.test(h)) M.last = i
      else if (/^(ชื่อ|ชื่อจริง|ชื่อตัว)$/.test(h)) M.first = i
      else if (/เลขประจำตัว|รหัสนักเรียน|รหัสประจำตัว/.test(h)) M.sid = i
      else if (/^(เลขที่|ลำดับ|ที่)$/.test(h)) M.no = i
      else if (/^(ชั้น|ระดับชั้น|ชั้นเรียน)/.test(h)) M.lv = i
    })
  }
  const out = body.map((r) => {
    let name, no = null, level = defaultLevel, sid = ''
    if (hdr) {
      name = M.full != null ? r[M.full] : (r[M.pre] || '') + (r[M.first] || '') + (r[M.last] ? ' ' + r[M.last] : '')
      if (M.no != null && /^\d+$/.test(r[M.no] || '')) no = +r[M.no]
      if (M.lv != null && r[M.lv]) level = normLevel(r[M.lv])
      if (M.sid != null) sid = r[M.sid] || ''
    } else {
      name = r.find((x) => x && !/^\d+$/.test(x))
      const nn = r.find((x) => /^\d+$/.test(x))
      if (nn) no = +nn
    }
    name = (name || '').replace(/\s+/g, ' ').trim()
    return { name, no, level, sid }
  }).filter((x) => x.name)
  const seen = new Set(activeStudents.map((s) => `${s.level}|${s.name}`))
  out.forEach((x) => {
    x.st = !LEVELS.includes(x.level) ? 'level' : seen.has(`${x.level}|${x.name}`) ? 'dup' : 'ok'
    if (x.st === 'ok') seen.add(`${x.level}|${x.name}`)
  })
  return { rows: out, hdr }
}

export async function readStudentFile(file, defaultLevel, activeStudents) {
  let rows
  if (/\.xlsx$/i.test(file.name)) rows = await readXlsx(await file.arrayBuffer())
  else if (/\.xls$/i.test(file.name)) throw new Error('ไฟล์ .xls รุ่นเก่าอ่านไม่ได้ ให้บันทึกเป็น .xlsx ก่อน')
  else {
    const buf = await file.arrayBuffer()
    let tx
    try { tx = new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { tx = new TextDecoder('windows-874').decode(buf) }
    rows = parseCSV(tx)
  }
  const m = mapRows(rows, defaultLevel, activeStudents)
  if (!m.rows.length) throw new Error('ไม่พบรายชื่อในไฟล์')
  return m
}
