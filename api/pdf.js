// POST /api/pdf  { html, filename }  (ส่ง Authorization: Bearer <Firebase ID token>)
// สร้างไฟล์ PDF จาก HTML ด้วย Chromium บน Vercel แล้วส่งกลับให้ดาวน์โหลด (ใช้กับไอแพด/มือถือ)
// คอมพิวเตอร์ใช้หน้าต่างพิมพ์ของเบราว์เซอร์ ไม่ผ่านไฟล์นี้
import fs from 'node:fs'
import path from 'node:path'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { adminAuth } from './_admin.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  let browser
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '')
    if (!token) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบ' })
    await adminAuth.verifyIdToken(token)

    const { html } = req.body || {}
    if (typeof html !== 'string' || !html || html.length > 4_000_000) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้องหรือใหญ่เกินไป' })

    // ฝังฟอนต์ TH Sarabun และโลโก้ลงในเอกสารโดยตรง (ไม่ต้องดึงผ่านเครือข่าย)
    const root = process.env.PDF_PUBLIC_DIR || path.join(process.cwd(), 'public')
    const MIME = { ttf: 'font/ttf', png: 'image/png' }
    const inline = html.replace(/https?:\/\/[^"')\s]+?\/(fonts\/[\w.-]+\.ttf|logo\.png)/g, (m, rel) => {
      try { return `data:${MIME[rel.split('.').pop()]};base64,${fs.readFileSync(path.join(root, rel)).toString('base64')}` } catch { return m }
    })

    const host = req.headers['x-forwarded-host'] || req.headers.host
    const allowed = (u) => u.startsWith('data:') || u.startsWith('about:') || u.startsWith(`https://${host}/`) || u.startsWith(`http://${host}/`)

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: process.env.PDF_CHROME_PATH || (await chromium.executablePath()),
      headless: 'shell',
    })
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(false)            // ไม่รันสคริปต์ใด ๆ ในเอกสาร
    await page.setRequestInterception(true)          // อนุญาตเฉพาะฟอนต์/รูปของเว็บเราเอง
    page.on('request', (r) => (allowed(r.url()) ? r.continue() : r.abort()))
    await page.setContent(inline, { waitUntil: 'networkidle0', timeout: 30000 })
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    res.setHeader('Content-Type', 'application/pdf')
    res.status(200).send(Buffer.from(pdf))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'สร้าง PDF ไม่สำเร็จ' })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
