// CSS สำหรับพิมพ์/ส่งออก ปพ.5 และใบแจ้งผล (A4 แนวตั้ง ฟอนต์ TH Sarabun)
export const printCss = (O) => `
@font-face{font-family:'TH SarabunPSK';font-weight:400;src:url(${O}/fonts/THSarabunPSK.ttf)}
@font-face{font-family:'TH SarabunPSK';font-weight:700;src:url(${O}/fonts/THSarabunPSK-Bold.ttf)}
@font-face{font-family:'TH SarabunPSK';font-weight:400;font-style:italic;src:url(${O}/fonts/THSarabunPSK-Italic.ttf)}
@page{size:A4;margin:14mm 14mm}@page land{size:A4 landscape;margin:12mm 12mm}
html,body{background:#fff!important;margin:0}
body,*{font-family:'TH SarabunPSK'!important;color:#000}
body{font-size:15pt;line-height:1.2}
.pg{display:block!important;border:0!important;outline:0!important;padding:0!important;max-width:none!important;width:auto!important;margin:0!important;break-after:page;font-size:15pt!important}
.pg:last-child{break-after:auto}
.pg.land{page:land}
.pg>*{margin:0 0 7px}
.pg h3{font-size:19pt!important;margin:2px 0 8px;font-weight:700}
.tw{overflow:visible!important;border:0!important;border-radius:0!important}
table{width:100%;border-collapse:collapse;border-radius:0!important;border:1px solid #000}
th,td{border:1px solid #000!important;padding:0 5px!important;font-size:15pt!important;background:#fff!important;color:#000!important}
th{font-weight:700;background:#fff!important}.rot{height:42mm;padding:0!important;vertical-align:bottom}.rv{writing-mode:vertical-rl;transform:rotate(180deg);display:inline-block;white-space:nowrap;margin:4px 0}.descp .blank{height:200mm}.bb.fx{background:#9aa3b8}.bk small{display:block;font-size:10pt;color:#555}.lg{display:inline-block;width:12px;height:12px;background:#8c1c1c}.lg.fx{background:#9aa3b8}
thead{display:table-header-group}tr{break-inside:avoid}
.num{text-align:center}.small{font-size:12pt!important;color:#444!important}
.ph{font-size:12pt!important;color:#555!important;border-bottom:1px solid #888;padding-bottom:3px;display:flex;justify-content:space-between;margin-bottom:8px!important}
.cover{display:grid!important;box-sizing:border-box;height:260mm;min-height:0;border:3px double #8c1c1c!important;outline:2px solid #c8a032!important;outline-offset:-12px;text-align:center;align-content:center;justify-items:center;padding:30px!important;gap:12px}
.cover img{width:150px;height:150px}.cover .big{font-size:26pt!important;color:#8c1c1c!important;font-weight:700}
.cover dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;text-align:left;font-size:17pt}.cover dt{font-weight:700;color:#8c1c1c!important}.cover dd{margin:0}
.cover:last-child{height:200mm}
.kv th{width:22%;text-align:left!important}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tiles div{border:1px solid #000;padding:6px;text-align:center;display:grid;font-size:13pt}.tiles b{font-size:22pt}
.bars{display:flex;align-items:flex-end;gap:6px;height:150px;border-bottom:1px solid #000;margin-bottom:40px!important}.bc{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;position:relative}.bb{width:70%;background:#8c1c1c;min-height:2px}.bk{position:absolute;bottom:-22px;font-size:13pt}.bn{font-size:12pt}
.bars2{display:flex;gap:6px}.bc2{flex:1;display:flex;flex-direction:column;text-align:center}.bt2{height:130px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;border-bottom:1px solid #000}.bb2{width:70%;background:#8c1c1c}.bb2.fx{background:#9aa3b8}.bn2{font-size:13pt}.bk2{font-weight:700;font-size:14pt}.bp2{font-size:11pt;color:#555}
.sigimg{height:34px;max-width:150px;vertical-align:middle}.sigimg.sm{height:24px}.dtxt{white-space:pre-wrap;line-height:1.4}.dimg{max-width:100%;max-height:230mm}.pw{white-space:pre-wrap;text-align:left}.descp .blank{height:200mm}
.sg{text-align:center;display:grid;gap:2px;margin-top:10px}.sg2{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px}

.rp{font-size:14pt!important}.pj{text-align:right;font-weight:700;font-size:14pt}.rhd{display:grid!important;justify-items:center;text-align:center;gap:0}.rhd img{width:24mm;height:24mm}.rhd b{font-size:17pt}.rhd span{font-size:14pt}
.rn .lbl{font-weight:700;color:#8c1c1c!important}.rl{display:flex!important;justify-content:space-between;border-bottom:1px solid #666;padding:2px 0;font-size:15pt}
.rt2 th{background:#f1e7c4!important}.rt2 th.grp{text-align:left;background:#fbf3d6!important}.rt2 td.sc{background:#fff8dc!important;font-weight:700}.rt2 td.avg{background:#f6e6a8!important;text-align:center;font-weight:700;font-size:16pt}
.rt2 td,.rt2 th{font-size:13.5pt!important;padding:0 6px!important;line-height:1.1}.rk{color:#b3261e!important}
.sg3{display:grid!important;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.sg3 .sg{font-size:13pt}
.pg.rp{break-after:page}.pg.rp:last-child{break-after:auto}.rp>*{margin-bottom:5px}
`
