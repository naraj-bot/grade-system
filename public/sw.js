// Service worker ของระบบผลการเรียน: ทำให้ติดตั้งเป็นแอปได้ และเปิดหน้าหลักได้แม้เน็ตไม่ดี
// - หน้าเว็บ (navigation): ขอจากเน็ตก่อน ถ้าเน็ตหลุดใช้หน้าที่เก็บไว้
// - ไฟล์ /assets/* (มีแฮชในชื่อ), ตรา, ไอคอน, ฟอนต์: ใช้ที่เก็บไว้ก่อน
// - ไม่เก็บ /api/* และข้อมูล Firebase (ต้องเป็นข้อมูลล่าสุดเสมอ)
const CACHE = 'bp-grade-v1'
const SHELL = ['/', '/logo.png', '/favicon.png', '/manifest.webmanifest', '/icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const same = url.origin === self.location.origin
  if (same && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/'))) return
  if (req.mode === 'navigate') {
    // เก็บเฉพาะหน้าแอป (SPA) ไว้ใช้ตอนออฟไลน์ ไม่เก็บไฟล์ .html อื่น เช่น manual.html
    const spa = !/\.[a-z0-9]+$/i.test(url.pathname)
    e.respondWith(fetch(req).then((r) => { if (spa && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('/', cp)) } return r })
      .catch(() => caches.match('/').then((r) => r || Response.error())))
    return
  }
  const fontHost = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com'
  if ((same && /^\/(assets|icons|fonts)\/|\/(logo|favicon)\.png$/.test(url.pathname)) || fontHost) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)) }
      return r
    })))
  }
})
