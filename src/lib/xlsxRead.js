// อ่านไฟล์ .xlsx (Excel / Google ชีตที่ดาวน์โหลดเป็น .xlsx) และ .csv โดยไม่พึ่งไลบรารี
// คืนค่าเป็นตาราง: [[ค่าเซลล์,...], ...] ของชีตแรก
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw')
  const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer()
  return new Uint8Array(buf)
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), out = {}
  let e = u8.length - 22
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--
  if (e < 0) throw new Error('ไม่ใช่ไฟล์ Excel (.xlsx)')
  const n = dv.getUint16(e + 10, true)
  let p = dv.getUint32(e + 16, true)
  const dec = new TextDecoder()
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true)
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true)
    const off = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl))
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true)
    const data = u8.subarray(start, start + csize)
    out[name] = { method, data }
    p += 46 + nl + xl + cl
  }
  return {
    async text(name) {
      const f = out[name]
      if (!f) return null
      const b = f.method === 0 ? f.data : await inflate(f.data)
      return dec.decode(b)
    },
  }
}

const colIdx = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1 }

export async function readXlsx(file) {
  const z = await unzip(await file.arrayBuffer())
  const P = (s) => new DOMParser().parseFromString(s, 'application/xml')
  // หาชีตแรกจาก workbook.xml + rels
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const wb = await z.text('xl/workbook.xml'), rels = await z.text('xl/_rels/workbook.xml.rels')
  if (wb && rels) {
    const first = P(wb).getElementsByTagName('sheet')[0]
    const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'))
    const rel = rid && [...P(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)
    if (rel) { const t = rel.getAttribute('Target'); sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '') }
  }
  const ssx = await z.text('xl/sharedStrings.xml')
  const shared = ssx ? [...P(ssx).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent).join('')) : []
  const sx = await z.text(sheetPath)
  if (!sx) throw new Error('อ่านชีตในไฟล์ไม่ได้')
  const rows = []
  for (const r of P(sx).getElementsByTagName('row')) {
    const ri = (+r.getAttribute('r') || rows.length + 1) - 1, row = (rows[ri] = rows[ri] || [])
    let ci = 0
    for (const c of r.getElementsByTagName('c')) {
      const ref = c.getAttribute('r'); if (ref) ci = colIdx(ref)
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]
      let val = ''
      if (t === 's') val = shared[+(v && v.textContent)] ?? ''
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('')
      else if (v) val = t === 'str' || t === 'b' ? v.textContent : (isNaN(+v.textContent) ? v.textContent : +v.textContent)
      row[ci++] = val
    }
  }
  return Array.from(rows, (r) => r || [])
}

export function readCsv(text) {
  const rows = [[]]; let cur = '', q = false
  const t = text.replace(/^\ufeff/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { rows[rows.length - 1].push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; rows[rows.length - 1].push(cur); cur = ''; rows.push([]) }
    else cur += ch
  }
  rows[rows.length - 1].push(cur)
  return rows.map((r) => r.map((x) => (x !== '' && !isNaN(+x) ? +x : x)))
}

export async function readTable(file) {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return readCsv(await file.text())
  return readXlsx(file)
}
