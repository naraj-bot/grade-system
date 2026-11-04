import { useEffect, useState } from 'react'

// ติดตั้งเป็นแอป: Android/Chrome/Edge ใช้หน้าต่างติดตั้งของเบราว์เซอร์ ส่วน iPhone/iPad ต้องกด "แชร์ → เพิ่มไปยังหน้าจอโฮม"
let deferred = null
const subs = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()) })
}
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function registerSW() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f) }, [])
  const standalone = isStandalone(), ios = isIOS()
  return {
    show: !standalone && (!!deferred || ios), // ซ่อนปุ่มเมื่อเปิดจากแอปที่ติดตั้งแล้ว
    ios: ios && !deferred,
    install: async () => { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; force((x) => x + 1); return r?.outcome === 'accepted' },
  }
}
