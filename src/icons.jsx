// ไอคอนเส้น 24x24 (ชุดเดียวกับต้นแบบ)
const PATHS = {
 "home": "<path d=\"M3 11l9-8 9 8M5 10v10h14V10\"/>",
 "cal": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/>",
 "users": "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.5a3.5 3.5 0 010 7M18 14.8c2 .6 3.2 2.3 3.5 5\"/>",
 "book": "<path d=\"M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5zM4 21.5V4.5M8 7h8\"/>",
 "reg": "<rect x=\"5\" y=\"3\" width=\"14\" height=\"18\" rx=\"2\"/><path d=\"M9 8h6M9 12h6M9 16l1.5 1.5L14 14\"/>",
 "edit": "<path d=\"M4 20h4L19 9l-4-4L4 16zM13 7l4 4\"/>",
 "flag": "<path d=\"M5 21V4M5 4h12l-2 4 2 4H5\"/>",
 "down": "<path d=\"M12 3v12M7 11l5 5 5-5M4 20h16\"/>",
 "print": "<path d=\"M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z\"/>",
 "star": "<path d=\"M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z\"/>",
 "school": "<path d=\"M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5\"/>",
 "pen": "<path d=\"M4 20l1-4L17 4l3 3L8 19zM14 7l3 3\"/>",
 "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01\"/>",
 "out": "<path d=\"M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9\"/>",
 "more": "<circle cx=\"5\" cy=\"12\" r=\"1.3\"/><circle cx=\"12\" cy=\"12\" r=\"1.3\"/><circle cx=\"19\" cy=\"12\" r=\"1.3\"/>"
}

export default function Icon({ name, size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] || '' }} />
  )
}
