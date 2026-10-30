// สร้างไฟล์ Word (.docx) จริงจากหน้า HTML ของ ปพ.5: โหลด HTML เข้า iframe ขนาด A4 แล้วอ่านโครงสร้างจริง (ตาราง ข้อความ รูป)
// แปลงเป็น WordprocessingML (ตาราง/ย่อหน้า/รูป) จึงเปิดและแก้ไขได้ทั้ง Word, WPS, LibreOffice และ Google เอกสาร
import { zip } from './xlsx'

const TW = 15 // พิกเซลที่ความกว้าง A4 = 794px → 1px = 15 twips
const FONT = 'TH SarabunPSK'
const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const hex = (css) => {
  const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?/.exec(css || '')
  if (!m) return null
  if (m[4] !== undefined && +m[4] === 0) return null
  return [m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export async function htmlToDocx(html) {
  const fr = document.createElement('iframe')
  fr.style.cssText = 'position:fixed;left:-9999px;top:0;width:1123px;height:1123px;border:0;visibility:hidden'
  document.body.appendChild(fr)
  try {
    const d = fr.contentDocument
    d.open(); d.write(html.replace('</head>', '<style>html,body{margin:0!important}body{padding:0!important}.pg{width:688px!important;margin:0!important}.pg.land{width:1033px!important}</style></head>')); d.close()
    await new Promise((ok) => { if (d.readyState === 'complete') ok(); else fr.onload = () => ok(); setTimeout(ok, 4000) })
    try { await d.fonts.ready } catch { /* ไม่เป็นไร */ }
    return await build(d, fr.contentWindow)
  } finally { fr.remove() }
}

async function build(d, w) {
  const cs = (el) => w.getComputedStyle(el)
  const media = [] // { name, bytes, ext }
  const imgs = new Map()
  for (const im of d.querySelectorAll('.pg img')) {
    try {
      let bytes, ext = 'png'
      const src = im.currentSrc || im.src
      if (/^data:/.test(src)) {
        const m = /^data:image\/(png|jpe?g|gif);base64,(.*)$/i.exec(src)
        if (!m) continue
        ext = m[1].toLowerCase().replace('jpeg', 'jpg')
        const bin = atob(m[2]); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      } else {
        const r = await fetch(src); if (!r.ok) continue
        bytes = new Uint8Array(await r.arrayBuffer())
        ext = /\.jpe?g/i.test(src) ? 'jpg' : 'png'
      }
      const name = `image${media.length + 1}.${ext}`
      media.push({ name, bytes, ext }); imgs.set(im, media.length)
    } catch { /* ข้ามรูปที่โหลดไม่ได้ */ }
  }
  let docId = 1

  const isHidden = (el) => { const c = cs(el); return c.display === 'none' || c.visibility === 'hidden' }
  const BLOCKS = new Set(['block', 'flex', 'grid', 'table', 'list-item', 'table-row', 'table-cell', 'table-row-group', 'table-header-group', 'flow-root'])
  const isBlock = (el) => el.nodeType === 1 && el.tagName !== 'IMG' && el.tagName !== 'BR' && BLOCKS.has(cs(el).display)
  const hasBlockChild = (el) => [...el.children].some((c) => !isHidden(c) && (isBlock(c) || hasBlockChild(c)))

  const rpr = (el, extra = '') => {
    const c = cs(el), px = parseFloat(c.fontSize) || 20, col = hex(c.color)
    const b = +c.fontWeight >= 600 || c.fontWeight === 'bold'
    return `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>${b ? '<w:b/><w:bCs/>' : ''}${c.fontStyle === 'italic' ? '<w:i/><w:iCs/>' : ''}${col && col !== '000000' ? `<w:color w:val="${col}"/>` : ''}<w:sz w:val="${Math.round(px * 1.5)}"/><w:szCs w:val="${Math.round(px * 1.5)}"/>${/underline/.test(c.textDecorationLine) ? '<w:u w:val="single"/>' : ''}${extra}</w:rPr>`
  }
  const run = (el, text, pre) => {
    if (!text) return ''
    const parts = pre ? text.split('\n') : [text]
    return parts.map((t, i) => `${i ? `<w:r>${rpr(el)}<w:br/></w:r>` : ''}${t ? `<w:r>${rpr(el)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : ''}`).join('')
  }
  const drawing = (im) => {
    const n = imgs.get(im); if (!n) return ''
    const r = im.getBoundingClientRect(); const cx = Math.max(1, Math.round(r.width * 9525)), cy = Math.max(1, Math.round(r.height * 9525))
    const id = docId++
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${media[n - 1].name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  }
  const inline = (el) => {
    let out = ''
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const pe = n.parentElement, pre = /pre/.test(cs(pe).whiteSpace)
        out += run(pe, pre ? n.nodeValue : n.nodeValue.replace(/\s+/g, ' '), pre)
      } else if (n.nodeType === 1 && !isHidden(n)) {
        if (n.tagName === 'BR') out += '<w:r><w:br/></w:r>'
        else if (n.tagName === 'IMG') out += drawing(n)
        else out += inline(n)
      }
    }
    return out
  }
  const para = (el, opt = {}) => {
    const c = cs(el)
    const al = { center: 'center', right: 'right', end: 'right', justify: 'both' }[c.textAlign] || 'left'
    const bb = parseFloat(c.borderBottomWidth) > 0 && c.borderBottomStyle !== 'none' && !opt.noBorder
    let runs = inline(el)
    runs = runs.replace(/^(<w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t xml:space="preserve">) +/, '$1')
    const sb = Math.max(0, Math.round((parseFloat(c.marginTop) || 0) * TW)), sa = Math.max(0, Math.round((parseFloat(c.marginBottom) || 0) * TW))
    return `<w:p><w:pPr><w:keepLines/>${opt.pageBreak ? '<w:pageBreakBefore/>' : ''}${bb ? `<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="666666"/></w:pBdr>` : ''}<w:spacing w:before="${opt.inCell ? 0 : sb}" w:after="${opt.inCell ? 0 : sa}" w:line="240" w:lineRule="auto"/><w:jc w:val="${al}"/></w:pPr>${runs}</w:p>`
  }
  const emptyPara = (pageBreak) => `<w:p><w:pPr>${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>`

  const borders = (c, over = {}) => {
    const one = (side) => {
      const wd = parseFloat(c['border' + side + 'Width']), st = c['border' + side + 'Style']
      if (!(wd > 0) || st === 'none' || st === 'hidden') return `<w:${side.toLowerCase().replace('left', 'left').replace('right', 'right')} w:val="nil"/>`
      return `<w:${side.toLowerCase()} w:val="single" w:sz="${Math.max(4, Math.round(wd * 6))}" w:space="0" w:color="${hex(c['border' + side + 'Color']) || '000000'}"/>`
    }
    return `<w:tcBorders>${one('Top')}${one('Left')}${one('Bottom')}${one('Right')}</w:tcBorders>`
  }

  // เนื้อหาในช่อง/หน้า: ถ้ามีบล็อกย่อยให้แตกต่อ ไม่เช่นนั้นทำเป็นย่อหน้าเดียว
  const blocks = (el, ctx = {}) => {
    if (!hasBlockChild(el)) return para(el, ctx)
    let out = ''
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) out += paraOf(n, el, ctx); continue }
      if (n.nodeType !== 1 || isHidden(n)) continue
      if (!isBlock(n)) { // อินไลน์ปะปนกับบล็อก → ย่อหน้าของตัวเอง
        const t = (n.textContent || '').trim()
        if (t || n.tagName === 'IMG') out += paraOf(n, el, ctx)
        continue
      }
      out += block(n, ctx)
    }
    return out || para(el, ctx)
  }
  const paraOf = (n, parent, ctx) => {
    const holder = { childNodes: [n] }
    const c = cs(parent)
    const al = { center: 'center', right: 'right', end: 'right' }[c.textAlign] || 'left'
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${al}"/></w:pPr>${n.tagName === 'IMG' ? drawing(n) : inline(holder)}</w:p>`
  }

  const block = (el, ctx = {}) => {
    const tag = el.tagName, c = cs(el)
    if (tag === 'TABLE') return table(el, ctx)
    if ((c.display === 'flex' || c.display === 'grid') && !/column/.test(c.flexDirection)) {
      const kids = [...el.children].filter((k) => !isHidden(k))
      if (kids.length >= 2 && kids.every((k) => k.getBoundingClientRect().width > 0)) return gridRows(el, kids, ctx)
    }
    return blocks(el, ctx)
  }

  // flex/grid แบบหลายคอลัมน์ → ตารางไร้เส้น (แยกตามแถวที่ตำแหน่งแนวตั้งต่างกัน)
  const gridRows = (el, kids, ctx) => {
    const rows = []
    for (const k of kids) {
      const t = Math.round(k.getBoundingClientRect().top)
      const last = rows[rows.length - 1]
      if (last && Math.abs(last.top - t) <= 3) last.items.push(k); else rows.push({ top: t, items: [k] })
    }
    const ec = cs(el), bb = parseFloat(ec.borderBottomWidth) > 0 && ec.borderBottomStyle !== 'none'
    return rows.map((r) => {
      const base = r.items.map((k) => Math.max(200, Math.round(k.getBoundingClientRect().width * TW)))
      const room = Math.max(0, Math.round(el.getBoundingClientRect().width * TW) - base.reduce((a, b) => a + b, 0))
      const ws = base.map((w) => w + Math.min(400, Math.floor(room / base.length))) // เผื่อความกว้างจากช่องว่างจริง ไม่ให้ตัวอักษรตกบรรทัด
      const cells = r.items.map((k, i) => `<w:tc><w:tcPr><w:tcW w:w="${ws[i]}" w:type="dxa"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/>${bb ? '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="666666"/>' : '<w:bottom w:val="nil"/>'}</w:tcBorders><w:noWrap/></w:tcPr>${cellBody(k)}</w:tc>`).join('')
      return `<w:tbl><w:tblPr><w:tblW w:w="${ws.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>${emptyPara()}`
    }).join('')
  }
  const cellBody = (k) => {
    const body = hasBlockChild(k) ? blocks(k, { inCell: true, noBorder: true }) : para(k, { inCell: true, noBorder: true })
    return body || '<w:p/>'
  }

  const table = (t) => {
    const trs = [...t.rows]
    const colW = []
    let ncol = 0
    // จำนวนคอลัมน์ + ความกว้างต่อคอลัมน์จากช่องที่ไม่ merge
    const pend = []
    trs.forEach((tr) => {
      let col = 0
      for (const cell of tr.cells) {
        while (pend[col] > 0) col++
        const cs_ = cell.colSpan || 1, rs = cell.rowSpan || 1
        if (cs_ === 1 && !colW[col]) colW[col] = Math.round(cell.getBoundingClientRect().width * TW)
        for (let i = 0; i < cs_; i++) if (rs > 1) pend[col + i] = rs
        col += cs_
        ncol = Math.max(ncol, col)
      }
      for (let i = 0; i < pend.length; i++) if (pend[i] > 0) pend[i]--
    })
    const known = colW.filter(Boolean), avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1000
    const tcw = t.getBoundingClientRect().width * TW
    for (let i = 0; i < ncol; i++) if (!colW[i]) colW[i] = Math.round(avg)
    const sum = colW.reduce((a, b) => a + b, 0)
    const cap = t.closest('.pg.land') ? 15478 : 10318
    if (sum > cap + 82) colW.forEach((_, i) => { colW[i] = Math.floor(colW[i] * cap / sum) })
    const total = colW.reduce((a, b) => a + b, 0)
    const rowsXml = []
    const pend2 = []
    const spans = []
    trs.forEach((tr, ri) => {
      let col = 0, cells = ''
      const fillCont = () => {
        while (pend2[col] > 0) { cells += `<w:tc><w:tcPr><w:tcW w:w="${colW[col]}" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>`; pend2[col]--; col++ }
      }
      for (const cell of tr.cells) {
        fillCont()
        const cs_ = cell.colSpan || 1, rs = cell.rowSpan || 1, c = cs(cell)
        const wsum = colW.slice(col, col + cs_).reduce((a, b) => a + b, 0)
        const fill = hex(c.backgroundColor), va = { middle: 'center', bottom: 'bottom' }[c.verticalAlign]
        const vertical = /vertical/.test(c.writingMode)
        cells += `<w:tc><w:tcPr><w:tcW w:w="${wsum}" w:type="dxa"/>${cs_ > 1 ? `<w:gridSpan w:val="${cs_}"/>` : ''}${rs > 1 ? '<w:vMerge w:val="restart"/>' : ''}${borders(c)}${fill && fill !== 'FFFFFF' ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${vertical ? '<w:textDirection w:val="btLr"/>' : ''}<w:vAlign w:val="${va || 'top'}"/></w:tcPr>${cellBody(cell)}</w:tc>`
        if (rs > 1) for (let i = 0; i < cs_; i++) pend2[col + i] = rs - 1
        col += cs_
      }
      fillCont()
      while (col < ncol) { cells += `<w:tc><w:tcPr><w:tcW w:w="${colW[col]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; col++ }
      const h = Math.round(tr.getBoundingClientRect().height * TW)
      const head = tr.parentElement && tr.parentElement.tagName === 'THEAD'
      rowsXml.push(`<w:tr><w:trPr><w:cantSplit/>${h > 0 ? `<w:trHeight w:val="${h}" w:hRule="atLeast"/>` : ''}${head ? '<w:tblHeader/>' : ''}</w:trPr>${cells}</w:tr>`)
    })
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${colW.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rowsXml.join('')}</w:tbl>${emptyPara()}`
  }

  let body = ''
  const pages = [...d.querySelectorAll('.pg')]
  const sectOf = (land) => land
    ? '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'
    : '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="794" w:right="794" w:bottom="794" w:left="794" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'
  let prevLand = false
  pages.forEach((pg, i) => {
    const land = pg.classList.contains('land')
    if (i > 0) body += land !== prevLand ? `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${sectOf(prevLand)}</w:pPr></w:p>` : emptyPara(true)
    body += blocks(pg)
    prevLand = land
  })
  const sect = sectOf(prevLand)
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
  const types = `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  const styles = `${X}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/><w:sz w:val="30"/><w:szCs w:val="30"/><w:lang w:val="th-TH" w:bidi="th-TH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`
  const rels = `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('')}</Relationships>`
  return zip([
    ['[Content_Types].xml', types],
    ['_rels/.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', `${X}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`],
    ['word/styles.xml', styles],
    ['word/_rels/document.xml.rels', rels],
    ...media.map((m) => [`word/media/${m.name}`, m.bytes]),
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}
