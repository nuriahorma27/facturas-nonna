import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Supabase (npm package) ───────────────────────────────────
import { createClient } from "@supabase/supabase-js";
const _sb = createClient(
  "https://jtqfxakabthzakmhncrw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cWZ4YWthYnRoemFrbWhuY3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMDEwNTAsImV4cCI6MjA4OTg3NzA1MH0.LF4zwnRxhUojv7P7dQRKSsPz9gmkoV1PXBGOggwG-yA"
);
async function db() { return _sb; }

// ── Google Drive via Apps Script ─────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwbnPxfeex7bGuZomB3UcJNAzuSeHLu1oI1BF4AFT0I0gXB71G9Lnhr6GjydZMAx0lliw/exec";

async function subirADrive(file, trimestre, anyo) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT") return null;
  try {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

    const formData = new FormData();
    formData.append('file', base64);
    formData.append('nombre', file.name);
    formData.append('mimeType', file.type || 'application/octet-stream');
    formData.append('trimestre', trimestre);
    formData.append('anyo', String(anyo));

    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: formData
    });

    const data = await resp.json();
    return data.success ? data.url : null;
  } catch(e) {
    console.warn("Drive upload failed:", e.message);
    return null;
  }
}

const CATS = ["Telas y materiales","Transporte y envíos","Marketing y publicidad","Equipamiento y maquinaria","Servicios externos","Nóminas","Alquiler","Suministros","Otros"];
const CAT_COLORS = ["#B8962E","#C4A882","#8B6914","#D4AF5A","#5C4A2A","#9C8E7A","#7A6A50","#D4C5A9","#E8DFC8"];
const fmt  = (n) => Number(n).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const fmtK = (n) => Math.abs(n)>=1000 ? (n/1000).toFixed(1).replace(".",",")+"k €" : Number(n).toFixed(0)+" €";

// ── CSS global ───────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cormorant Garamond',Georgia,serif;color:#2C2417;background:#EDE5D0}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes modalIn{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

.app{display:flex;min-height:100vh}
.sidebar{width:220px;background:#2C2417;display:flex;flex-direction:column;flex-shrink:0;position:sticky;top:0;height:100vh}
.sb-logo{padding:28px 24px 20px;border-bottom:1px solid rgba(255,255,255,.08)}
.sb-mono{width:38px;height:38px;border:1.5px solid #B8962E;display:flex;align-items:center;justify-content:center;color:#B8962E;font-size:15px;margin-bottom:10px}
.sb-name{font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:#D4C5A9}
.sb-sub{font-size:10px;color:#9C8E7A;margin-top:2px;letter-spacing:.1em}
.sb-nav{flex:1;padding:16px 0}
.sb-item{display:flex;align-items:center;gap:12px;padding:13px 24px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s;border-left:2px solid transparent}
.sb-item:hover{color:#EDE5D0;background:rgba(255,255,255,.05)}
.sb-item.active{color:#F5F0E8;border-left-color:#B8962E;background:rgba(184,150,46,.1)}
.sb-item svg{width:16px;height:16px;flex-shrink:0}
.sb-footer{padding:20px 24px;border-top:1px solid rgba(255,255,255,.08);font-size:10px;color:#5C4A2A;letter-spacing:.1em}
.sb-dot{width:5px;height:5px;border-radius:50%;background:#7BAE7F;box-shadow:0 0 6px #7BAE7F;display:inline-block;margin-right:6px;animation:pulse 2s ease-in-out infinite}
.main{flex:1;overflow:auto;background:#EDE5D0}
.view{padding:48px 44px;animation:fadeUp .5s ease both}

.eyebrow{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#B8962E;margin-bottom:8px;display:flex;align-items:center;gap:10px}
.eyebrow::before{content:'';width:20px;height:.5px;background:#B8962E}
.view-title{font-size:34px;font-weight:300;margin-bottom:32px}
.view-title em{font-style:italic;color:#8B6914}

.btn-ink{padding:11px 26px;background:#2C2417;border:none;font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#F5F0E8;cursor:pointer;position:relative;overflow:hidden;transition:letter-spacing .3s;display:flex;align-items:center;gap:8px}
.btn-ink::before{content:'';position:absolute;inset:0;background:#8B6914;transform:translateX(-100%);transition:transform .3s ease}
.btn-ink:hover::before{transform:translateX(0)}
.btn-ink:hover{letter-spacing:.3em}
.btn-ink span,.btn-ink svg{position:relative;z-index:1}
.btn-ink:disabled{opacity:.5;cursor:not-allowed}
.btn-ink:disabled::before{display:none}
.btn-out{padding:11px 22px;background:none;border:1px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#5C4A2A;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:8px}
.btn-out:hover{border-color:#B8962E;color:#8B6914}
.btn-sm{padding:8px 18px;background:none;border:.5px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s}
.btn-sm:hover{border-color:#2C2417;color:#2C2417}

.toast{position:fixed;bottom:28px;right:28px;padding:14px 22px;font-family:'Cormorant Garamond',serif;font-size:14px;z-index:9999;animation:fadeUp .3s ease both;min-width:200px}
.toast-ok{background:#2C2417;color:#F5F0E8;border-left:3px solid #7BAE7F}
.toast-err{background:#2C2417;color:#F5F0E8;border-left:3px solid #C25A4A}

.spin{width:18px;height:18px;border:2px solid #D4C5A9;border-top-color:#B8962E;border-radius:50%;animation:spin 1s linear infinite}

.card{background:#F5F0E8;border:.5px solid #D4C5A9;padding:24px}
.card:hover{box-shadow:0 6px 28px rgba(44,36,23,.07)}

.pills{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
.pill{padding:7px 18px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;border:.5px solid #D4C5A9;display:flex;align-items:center;gap:8px;background:#F5F0E8}
.pill-dot{width:6px;height:6px;border-radius:50%}
.pill-val{font-size:15px;font-weight:500;color:#2C2417}

.upload-zone{border:1.5px dashed #D4C5A9;background:#F5F0E8;padding:56px 40px;text-align:center;cursor:pointer;transition:all .3s;position:relative;overflow:hidden;margin-bottom:24px}
.upload-zone:hover,.upload-zone.drag{border-color:#B8962E;background:#FAF7F0;box-shadow:0 6px 32px rgba(184,150,46,.1)}
.up-icon{width:52px;height:52px;margin:0 auto 18px;border:1px solid #D4C5A9;display:flex;align-items:center;justify-content:center;transition:all .3s}
.upload-zone:hover .up-icon{border-color:#B8962E;transform:translateY(-3px)}
.up-icon svg{width:22px;height:22px;stroke:#9C8E7A;transition:stroke .3s}
.upload-zone:hover .up-icon svg{stroke:#B8962E}
.up-title{font-size:17px;font-weight:300;margin-bottom:6px}
.up-title em{font-style:italic;color:#B8962E}
.up-sub{font-size:13px;color:#9C8E7A;margin-bottom:18px}
.fmt-tags{display:flex;justify-content:center;gap:8px}
.fmt-tag{padding:3px 11px;border:.5px solid #D4C5A9;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#9C8E7A}
.file-cards{margin-bottom:16px}
.fc{background:#F5F0E8;border:.5px solid #D4C5A9;padding:14px 18px;margin-bottom:7px;display:flex;align-items:center;gap:14px;transition:all .3s;position:relative;overflow:hidden}
.fc.processing::after,.fc.uploading::after{content:'';position:absolute;bottom:0;left:0;height:2px;background:linear-gradient(90deg,#B8962E,#D4AF5A,#B8962E);background-size:200% 100%;animation:shimmer 1.5s linear infinite;width:100%}
.fc.done{border-color:rgba(123,174,127,.4)}.fc.saved{border-color:rgba(123,174,127,.6);background:#FAFFF8}.fc.error{border-color:rgba(180,60,40,.3)}
.fc-thumb{width:38px;height:44px;border:.5px solid #D4C5A9;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;letter-spacing:.08em;color:#9C8E7A;background:#EDE5D0;text-transform:uppercase}
.fc-info{flex:1;min-width:0}
.fc-name{font-size:13px;color:#2C2417;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.fc-meta{font-size:11px;color:#9C8E7A}
.fc-st{flex-shrink:0;display:flex;align-items:center;gap:5px;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.st-dot{width:5px;height:5px;border-radius:50%}
.st-waiting .st-dot{background:#D4C5A9}
.st-processing,.st-uploading{color:#B8962E}.st-processing .st-dot,.st-uploading .st-dot{background:#B8962E;animation:pulse 1s ease-in-out infinite}
.st-done{color:#5A8A5E}.st-done .st-dot{background:#7BAE7F}
.st-error{color:#8B3A2A}.st-error .st-dot{background:#C25A4A}
.rm-btn{width:26px;height:26px;background:none;border:.5px solid transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#D4C5A9;transition:all .2s;flex-shrink:0}
.rm-btn:hover{border-color:rgba(180,60,40,.3);color:#8B3A2A}
.result-card{background:#F5F0E8;border:.5px solid #D4C5A9;margin-bottom:16px;overflow:hidden;transition:box-shadow .3s}
.result-card.saved-c{border-color:rgba(123,174,127,.5);background:#FAFFF8}
.rc-hd{padding:14px 18px;background:#EDE5D0;border-bottom:.5px solid #D4C5A9;display:flex;align-items:center;justify-content:space-between}
.rc-name{font-size:13px;font-weight:500;color:#2C2417}
.rc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr))}
.rc-f{padding:13px 18px;border-right:.5px solid #D4C5A9;border-bottom:.5px solid #D4C5A9}
.rc-f:last-child{border-right:none}
.rc-lbl{font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:#9C8E7A;margin-bottom:5px}
.rc-inp{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;font-family:'Cormorant Garamond',serif;font-size:14px;color:#2C2417;outline:none;padding:1px 0;transition:border-color .2s}
.rc-inp:hover{border-bottom-color:#D4C5A9}.rc-inp:focus{border-bottom-color:#B8962E}.rc-inp:disabled{color:#9C8E7A}
.rc-sel{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;font-family:'Cormorant Garamond',serif;font-size:14px;color:#2C2417;outline:none;padding:1px 0;-webkit-appearance:none;cursor:pointer;transition:border-color .2s}
.rc-sel:hover{border-bottom-color:#D4C5A9}.rc-sel:focus{border-bottom-color:#B8962E}.rc-sel:disabled{color:#9C8E7A;cursor:default}
.rc-act{padding:14px 18px;display:flex;gap:10px;justify-content:flex-end;border-top:.5px solid #D4C5A9}

.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;font-size:9px;letter-spacing:.15em;text-transform:uppercase}
.badge-gasto{background:rgba(180,60,40,.07);color:#8B3A2A;border:.5px solid rgba(180,60,40,.2)}
.badge-ingreso{background:rgba(91,138,94,.07);color:#3A6B3E;border:.5px solid rgba(91,138,94,.2)}
.badge-pagada{color:#3A6B3E}.badge-pendiente{color:#8B6914}
.badge-ok{background:rgba(91,138,94,.1);color:#3A6B3E;border:.5px solid rgba(91,138,94,.3)}
.e-dot{width:5px;height:5px;border-radius:50%;display:inline-block;margin-right:3px}
.dot-pagada{background:#7BAE7F}.dot-pendiente{background:#B8962E}

.fl-bar{background:#F5F0E8;border:.5px solid #D4C5A9;padding:18px 22px;margin-bottom:22px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
.fg{display:flex;flex-direction:column;gap:5px;min-width:130px;flex:1}
.fl{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810}
.fi,.fs{background:transparent;border:none;border-bottom:1.5px solid #9C8E7A;font-family:'Cormorant Garamond',serif;font-size:14px;color:#2C2417;outline:none;padding:5px 0;width:100%;-webkit-appearance:none;transition:border-color .2s}
.fi:focus,.fs:focus{border-bottom-color:#B8962E}
.fi::placeholder{color:#9C8E7A;font-style:italic}
.twrap{background:#F5F0E8;border:.5px solid #D4C5A9;overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:980px}
th{padding:13px 13px;text-align:left;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#2C2417;font-weight:600;border-bottom:1.5px solid #B8962E;background:#EDE5D0;white-space:nowrap;user-select:none}
th.sort{cursor:pointer;transition:color .2s}
th.sort:hover,th.sorted{color:#8B6914}
tr.dr{border-bottom:.5px solid #D4C5A9;transition:background .2s}
tr.dr:last-child{border-bottom:none}
tr.dr:hover{background:#FAF7F0}
tr.editing{background:#FFFDF7;outline:1px solid #B8962E}
td{padding:12px 13px;font-size:14px;color:#2C2417;vertical-align:middle}
.ii{background:transparent;border:none;border-bottom:1px solid #B8962E;font-family:'Cormorant Garamond',serif;font-size:14px;color:#2C2417;outline:none;padding:2px 0;width:100%}
.is{background:transparent;border:none;border-bottom:1px solid #B8962E;font-family:'Cormorant Garamond',serif;font-size:14px;color:#2C2417;outline:none;padding:2px 0;width:100%;-webkit-appearance:none;cursor:pointer}
.acts{display:flex;gap:3px;align-items:center}
.ib{width:30px;height:30px;background:none;border:.5px solid transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#9C8E7A;transition:all .2s}
.ib:hover{border-color:#D4C5A9;color:#2C2417}
.ib.eye:hover{border-color:#B8962E;color:#8B6914}
.ib.dl:hover{border-color:#5C4A2A;color:#2C2417}
.ib.sv:hover{border-color:#5A8A5E;color:#3A6B3E}
.ib.del:hover{border-color:rgba(180,60,40,.4);color:#8B3A2A}
.file-tag{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 7px;border:.5px solid #D4C5A9;color:#9C8E7A}
.file-tag.has{color:#8B6914;border-color:rgba(184,150,46,.35);background:rgba(184,150,46,.05)}
.tfoot{padding:13px 18px;border-top:.5px solid #D4C5A9;display:flex;justify-content:space-between;align-items:center;background:#EDE5D0}
.tfoot-count{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9C8E7A}
.tfoot-tots{display:flex;gap:22px}
.tfoot-it{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.tfoot-lbl{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#9C8E7A}
.tfoot-val{font-size:15px;font-weight:500}
.empty-row{padding:56px;text-align:center;color:#9C8E7A;font-style:italic;font-size:15px}
.loading-row{padding:36px;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px;color:#9C8E7A;font-style:italic}

.tabs{display:flex;background:#F5F0E8;border:.5px solid #D4C5A9;margin-bottom:0}
.tab{padding:12px 26px;background:none;border:none;font-family:'Cormorant Garamond',serif;font-size:14px;letter-spacing:.15em;text-transform:uppercase;color:#5C4A2A;cursor:pointer;transition:all .2s;border-right:.5px solid #D4C5A9}
.tab:last-child{border-right:none}
.tab.active{background:#2C2417;color:#F5F0E8}
.tab:not(.active):hover{background:#EDE5D0}
.period-tabs{display:flex;gap:8px;margin-bottom:28px}
.ptab{padding:9px 18px;background:none;border:1.5px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#2C2417;cursor:pointer;transition:all .2s}
.ptab.active{border-color:#8B6914;color:#8B6914;background:rgba(139,105,20,.06);font-weight:500}
.ptab:not(.active):hover{border-color:#2C2417}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:26px}
.kpi{background:#F5F0E8;border:.5px solid #D4C5A9;padding:22px;position:relative;overflow:hidden;transition:all .3s}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);opacity:.65}
.kpi:hover{box-shadow:0 6px 28px rgba(44,36,23,.08);transform:translateY(-1px)}
.kpi-lbl{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810;margin-bottom:10px}
.kpi-val{font-size:32px;font-weight:300;letter-spacing:-.02em;color:var(--cl);margin-bottom:6px}
.kpi-sub{font-size:14px;color:#2C2417;font-style:italic;line-height:1.6;white-space:pre-line}
.kpi-delta{font-size:14px;margin-top:8px;display:flex;align-items:center;gap:5px;font-weight:500}
.dpos{color:#2E6B32}.dneg{color:#8B3A2A}
.ch-card{background:#F5F0E8;border:.5px solid #D4C5A9;padding:26px;transition:box-shadow .3s}
.ch-card:hover{box-shadow:0 6px 28px rgba(44,36,23,.06)}
.ch-title{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#3A2810;margin-bottom:4px}
.ch-sub{font-size:15px;color:#2C2417;margin-bottom:22px;font-style:italic}
.ch-subtabs{display:flex;gap:0;margin-bottom:18px;border-bottom:.5px solid #D4C5A9}
.ch-stab{padding:8px 18px;background:none;border:none;border-bottom:2px solid transparent;font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s;margin-bottom:-.5px}
.ch-stab.active{color:#2C2417;border-bottom-color:#B8962E}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}
.full{grid-column:1/-1}
.pend-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:.5px solid #D4C5A9}
.pend-row:last-child{border-bottom:none}
.pend-n{font-size:14px;font-weight:500;color:#2C2417}
.pend-d{font-size:12px;color:#5C4A2A;margin-top:2px}
.pend-amt{font-size:16px;font-weight:500}
.prov-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:.5px solid #D4C5A9}
.prov-row:last-child{border-bottom:none}
.prov-rank{font-size:11px;color:#D4C5A9;width:20px;text-align:center}
.prov-bw{flex:1;display:flex;flex-direction:column;gap:3px}
.prov-nm{font-size:13px;color:#2C2417}
.prov-bar{height:3px;background:#D4C5A9;border-radius:2px;overflow:hidden}
.prov-fill{height:100%;background:#B8962E;border-radius:2px;transition:width .8s ease}
.prov-tot{font-size:13px;font-weight:500;color:#2C2417;white-space:nowrap}
.iva-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.iva-c{padding:14px;border:.5px solid #D4C5A9;text-align:center}
.iva-lbl{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810;margin-bottom:6px}
.iva-val{font-size:20px;font-weight:300;color:#B8962E}
.iva-s{font-size:12px;color:#3A2810;margin-top:3px}
.trim-table{width:100%;border-collapse:collapse;font-family:'Cormorant Garamond',serif}
.trim-table th{padding:9px 14px;text-align:right;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#3A2810;font-weight:400;border-bottom:.5px solid #D4C5A9}
.trim-table th:first-child{text-align:left}
.trim-table td{padding:11px 14px;text-align:right;font-size:14px;color:#2C2417;border-bottom:.5px solid #D4C5A9}
.trim-table td:first-child{text-align:left;font-weight:500;color:#8B6914}
.trim-table tr:last-child td{border-bottom:none}
.ctooltip{background:#2C2417;padding:9px 13px;border:none}
.ctt-lbl{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#D4C5A9;margin-bottom:5px}
.ctt-row{display:flex;align-items:center;gap:7px;font-size:13px;color:#F5F0E8}
.ctt-dot{width:6px;height:6px;border-radius:50%}

.exp-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:18px 22px;background:#F5F0E8;border:.5px solid #D4C5A9;margin-bottom:24px}
.exp-lbl{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#5C4A2A;margin-right:4px}
.scope-btn{padding:9px 18px;background:none;border:1px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#5C4A2A;cursor:pointer;transition:all .2s}
.scope-btn.active{background:#2C2417;color:#F5F0E8;border-color:#2C2417}
.scope-btn:not(.active):hover{border-color:#2C2417;color:#2C2417}
.trim-sel{padding:9px 14px;background:#EDE5D0;border:1px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:13px;color:#2C2417;outline:none;cursor:pointer;-webkit-appearance:none;transition:border-color .2s}
.trim-sel:focus{border-color:#B8962E}
.prev-tabs{display:flex;gap:0;border-bottom:.5px solid #D4C5A9;margin-bottom:18px}
.prev-tab{padding:9px 22px;background:none;border:none;border-bottom:2px solid transparent;font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s;margin-bottom:-.5px}
.prev-tab.active{color:#2C2417;border-bottom-color:#B8962E}
.sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:22px}
.sum-c{padding:14px;border:.5px solid #D4C5A9;background:#EDE5D0}
.sum-lbl{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810;margin-bottom:6px}
.sum-val{font-size:18px;font-weight:300}
.sh-info{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:.5px solid #D4C5A9}
.sh-tag{padding:4px 12px;border:.5px solid #D4C5A9;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#5C4A2A;display:flex;align-items:center;gap:6px}

.overlay{position:fixed;inset:0;background:rgba(44,36,23,.75);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(4px);animation:fadeIn .2s ease both}
.modal{background:#F5F0E8;width:100%;max-width:840px;max-height:90vh;display:flex;flex-direction:column;animation:modalIn .3s ease both;box-shadow:0 20px 70px rgba(44,36,23,.35)}
.modal-hd{padding:18px 26px;border-bottom:.5px solid #D4C5A9;display:flex;align-items:center;justify-content:space-between;background:#EDE5D0}
.modal-ttl{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#2C2417}
.modal-meta{font-size:13px;color:#5C4A2A;font-style:italic;margin-top:3px}
.modal-x{width:34px;height:34px;background:none;border:.5px solid #D4C5A9;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9C8E7A;transition:all .2s}
.modal-x:hover{border-color:#2C2417;color:#2C2417}
.modal-body{flex:1;overflow:auto;padding:26px;display:flex;gap:26px}
.modal-prev{flex:1;min-height:340px;background:#EDE5D0;border:.5px solid #D4C5A9;display:flex;align-items:center;justify-content:center;overflow:hidden}
.modal-prev img{max-width:100%;max-height:440px;object-fit:contain}
.modal-ph{display:flex;flex-direction:column;align-items:center;gap:10px;color:#9C8E7A;text-align:center;padding:20px}
.modal-ph svg{opacity:.3}
.modal-ph span{font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.modal-ph small{font-size:11px;opacity:.7;font-style:italic;letter-spacing:0;text-transform:none}
.modal-data{width:230px;flex-shrink:0}
.modal-dt{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#5C4A2A;margin-bottom:14px}
.mf{padding:9px 0;border-bottom:.5px solid #D4C5A9}
.mf:last-child{border-bottom:none}
.mf-lbl{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:#9C8E7A;margin-bottom:3px}
.mf-val{font-size:14px;color:#2C2417}
.modal-ft{padding:14px 26px;border-top:.5px solid #D4C5A9;display:flex;gap:9px;justify-content:flex-end;background:#EDE5D0}

@media(max-width:900px){
  .sidebar{width:56px}.sb-name,.sb-sub,.sb-item span{display:none}
  .sb-item{padding:14px;justify-content:center}.sb-logo{padding:16px;align-items:center;display:flex}
  .sb-mono{margin:0}.sb-footer{display:none}
  .view{padding:32px 18px}
  .charts-grid{grid-template-columns:1fr}.full{grid-column:1}
  .modal-body{flex-direction:column}.modal-data{width:100%}
  .iva-grid{grid-template-columns:1fr 1fr}
}
`;

// ── Iconos ───────────────────────────────────────────────────
const I = {
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>,
  list:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>,
  dash:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>,
  export: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>,
  eye:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  down:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>,
  edit:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>,
  del:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>,
  ok:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>,
  x:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>,
  pdf:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>,
  xl:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  zip:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>,
};

// ── Helpers ──────────────────────────────────────────────────
async function extractWithAI(file) {
  const b64 = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
  const isPdf = file.type==="application/pdf";
  const block = isPdf
    ? {type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}}
    : {type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}};
  const prompt = `Analiza esta factura. Responde SOLO con JSON válido sin texto extra ni backticks:
{"tipo":"gasto","fecha":"DD/MM/YYYY","numero_factura":"","proveedor_cliente":"","nif_cif":"","concepto":"","base_imponible":0,"iva_porcentaje":21,"iva_importe":0,"total":0,"categoria":"Otros","estado":"pendiente"}
tipo: gasto|ingreso. categoria: Telas y materiales|Transporte y envíos|Marketing y publicidad|Equipamiento y maquinaria|Servicios externos|Nóminas|Alquiler|Suministros|Otros. estado: pagada|pendiente.`;

  const endpoint = typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/.netlify/functions/ai-extract"
    : "https://api.anthropic.com/v1/messages";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role:"user", content:[block,{type:"text",text:prompt}] }] }),
  });

  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
  const d = await res.json();
  const txt = d.content?.map(b=>b.text||"").join("")||"";
  const clean = txt.replace(/```json|```/g,"").trim();
  return JSON.parse(clean);
}

function buildExcel(facturas) {
  const wb = XLSX.utils.book_new();
  const C={hBg:"FFEDE5D0",hFg:"FF2C2417",titBg:"FF2C2417",titFg:"FFF5F0E8",goldBg:"FFB8962E",goldFg:"FFF5F0E8",ingBg:"FFE8F4E8",gasBg:"FFF4E8E8",pos:"FF2E6B32",neg:"FF8B3A2A",brd:"FFD4C5A9",wht:"FFFFFFFF",pend:"FFFFF3CD"};
  const brd={top:{style:"thin",color:{argb:C.brd}},bottom:{style:"thin",color:{argb:C.brd}},left:{style:"thin",color:{argb:C.brd}},right:{style:"thin",color:{argb:C.brd}}};
  const s=(bg,fg="FF2C2417",bold=false,sz=11,ha="left")=>({font:{name:"Garamond",sz,bold,color:{argb:fg}},fill:{patternType:"solid",fgColor:{argb:bg}},alignment:{horizontal:ha,vertical:"center"},border:brd});
  const sc=(ws,ref,v,st,t="s")=>{ws[ref]={t,v,s:st};};
  const build=(data,label)=>{
    const ws={};ws["!merges"]=[];let row=1;
    ws["!merges"].push({s:{r:0,c:0},e:{r:0,c:11}});
    sc(ws,`A${row}`,"ATELIER LA NONNA — Gestor de Facturas 2025",s(C.titBg,C.titFg,true,14,"center"));
    for(let c=1;c<=11;c++) sc(ws,XLSX.utils.encode_cell({r:row-1,c}),"",s(C.titBg,C.titFg));row++;
    ws["!merges"].push({s:{r:1,c:0},e:{r:1,c:11}});
    sc(ws,`A${row}`,`${label}   ·   ${new Date().toLocaleDateString("es-ES")}`,s(C.goldBg,C.goldFg,false,11,"center"));
    for(let c=1;c<=11;c++) sc(ws,XLSX.utils.encode_cell({r:row-1,c}),"",s(C.goldBg,C.goldFg));row++;row++;
    ws["!merges"].push({s:{r:row-1,c:0},e:{r:row-1,c:11}});
    sc(ws,`A${row}`,"RESUMEN",s(C.hBg,C.hFg,true,12,"center"));
    for(let c=1;c<=11;c++) sc(ws,XLSX.utils.encode_cell({r:row-1,c}),"",s(C.hBg,C.hFg));row++;
    const gas=data.filter(f=>f.tipo==="gasto"),ing=data.filter(f=>f.tipo==="ingreso");
    const tI=ing.reduce((a,f)=>a+Number(f.total),0),tG=gas.reduce((a,f)=>a+Number(f.total),0);
    const bal=tI-tG,ivaR=ing.reduce((a,f)=>a+Number(f.iva_importe),0),ivaS=gas.reduce((a,f)=>a+Number(f.iva_importe),0);
    ["","Ingresos","Gastos","Balance","IVA Repercutido","IVA Soportado","IVA Neto","","","","",""].forEach((h,i)=>sc(ws,XLSX.utils.encode_cell({r:row-1,c:i}),h,s(C.hBg,C.hFg,true,10,"center")));row++;
    ["",[tI,"pos"],[tG,"neg"],[bal,bal>=0?"pos":"neg"],[ivaR,""],[ivaS,""],[ivaR-ivaS,(ivaR-ivaS)>=0?"neg":"pos"],"","","","",""].forEach((v,i)=>{
      const val=Array.isArray(v)?v[0]:v,color=Array.isArray(v)&&v[1]?C[v[1]]:"FF2C2417";
      sc(ws,XLSX.utils.encode_cell({r:row-1,c:i}),typeof val==="number"?val.toFixed(2)+" €":val,s(C.wht,color,typeof val==="number",12,"center"));
    });row++;row++;
    ws["!merges"].push({s:{r:row-1,c:0},e:{r:row-1,c:11}});
    sc(ws,`A${row}`,"DETALLE DE FACTURAS",s(C.hBg,C.hFg,true,12,"center"));
    for(let c=1;c<=11;c++) sc(ws,XLSX.utils.encode_cell({r:row-1,c}),"",s(C.hBg,C.hFg));row++;
    ["Tipo","Fecha","Nº Factura","Proveedor / Cliente","NIF/CIF","Base Imponible","IVA %","IVA Importe","Total","Categoría","Estado","Archivo"]
      .forEach((h,i)=>sc(ws,XLSX.utils.encode_cell({r:row-1,c:i}),h,s(C.hBg,C.hFg,true,10,"center")));row++;
    data.forEach(f=>{
      const bg=f.estado==="pendiente"?C.pend:f.tipo==="ingreso"?C.ingBg:C.gasBg;
      [f.tipo==="gasto"?"Gasto":"Ingreso",f.fecha,f.numero_factura,f.proveedor_cliente,f.nif_cif,
       Number(f.base_imponible),f.iva_porcentaje+"%",Number(f.iva_importe),Number(f.total),f.categoria,
       f.estado==="pagada"?"✓ Pagada":"⏳ Pendiente",f.archivo_nombre||""
      ].forEach((v,i)=>{const isT=i===8,fg=isT?(f.tipo==="ingreso"?C.pos:C.neg):"FF2C2417";sc(ws,XLSX.utils.encode_cell({r:row-1,c:i}),v,s(bg,fg,isT,isT?12:11,isT?"right":"left"),typeof v==="number"?"n":"s");});row++;
    });
    const totBase=data.reduce((a,f)=>a+Number(f.base_imponible),0),totIva=data.reduce((a,f)=>a+Number(f.iva_importe),0),totTot=data.reduce((a,f)=>a+Number(f.total),0);
    ["","","","TOTAL","",totBase.toFixed(2)+" €","",totIva.toFixed(2)+" €",totTot.toFixed(2)+" €","","",""]
      .forEach((v,i)=>sc(ws,XLSX.utils.encode_cell({r:row-1,c:i}),v,s(C.goldBg,i===8?(totTot>=0?C.pos:C.neg):C.goldFg,true,12,i>=5?"right":"left")));
    ws["!cols"]=[8,12,18,28,14,14,7,14,14,20,12,20].map(w=>({wch:w}));
    ws["!ref"]=`A1:${XLSX.utils.encode_col(11)}${row}`;
    return ws;
  };
  XLSX.utils.book_append_sheet(wb,build(facturas,"Todas las facturas"),"Resumen");
  XLSX.utils.book_append_sheet(wb,build(facturas.filter(f=>f.tipo==="ingreso"),"Ingresos"),"Ingresos");
  XLSX.utils.book_append_sheet(wb,build(facturas.filter(f=>f.tipo==="gasto"),"Gastos"),"Gastos");
  XLSX.writeFile(wb,"AtelierLaNonna_"+new Date().toISOString().slice(0,10)+".xlsx",{bookType:"xlsx",cellStyles:true});
}

const MOCK = [
  {id:"1",tipo:"gasto",fecha:"15/01/2025",numero_factura:"F-2025-001",proveedor_cliente:"Tejidos Martínez S.L.",nif_cif:"B-12345678",base_imponible:1200,iva_porcentaje:21,iva_importe:252,total:1452,categoria:"Telas y materiales",estado:"pagada",trimestre:"T1",archivo_tipo:"pdf",archivo_nombre:"F-2025-001.pdf"},
  {id:"2",tipo:"gasto",fecha:"20/01/2025",numero_factura:"F-2025-002",proveedor_cliente:"MRW Express",nif_cif:"A-87654321",base_imponible:89.5,iva_porcentaje:21,iva_importe:18.8,total:108.3,categoria:"Transporte y envíos",estado:"pagada",trimestre:"T1",archivo_tipo:"pdf",archivo_nombre:"F-2025-002.pdf"},
  {id:"3",tipo:"ingreso",fecha:"22/01/2025",numero_factura:"ALN-2025-001",proveedor_cliente:"Sophie Dupont",nif_cif:"",base_imponible:680,iva_porcentaje:21,iva_importe:142.8,total:822.8,categoria:"Servicios externos",estado:"pagada",trimestre:"T1",archivo_tipo:"image",archivo_nombre:"ALN-2025-001.jpg"},
  {id:"4",tipo:"gasto",fecha:"05/02/2025",numero_factura:"F-2025-015",proveedor_cliente:"Publicidad Digital SL",nif_cif:"B-99887766",base_imponible:450,iva_porcentaje:21,iva_importe:94.5,total:544.5,categoria:"Marketing y publicidad",estado:"pendiente",trimestre:"T1",archivo_tipo:"pdf",archivo_nombre:"F-2025-015.pdf"},
  {id:"5",tipo:"ingreso",fecha:"10/02/2025",numero_factura:"ALN-2025-002",proveedor_cliente:"Isabella Romano",nif_cif:"",base_imponible:920,iva_porcentaje:21,iva_importe:193.2,total:1113.2,categoria:"Servicios externos",estado:"pendiente",trimestre:"T1",archivo_tipo:"image",archivo_nombre:"ALN-2025-002.jpg"},
  {id:"6",tipo:"gasto",fecha:"14/02/2025",numero_factura:"F-2025-022",proveedor_cliente:"Oficinas Renta S.A.",nif_cif:"A-11223344",base_imponible:1500,iva_porcentaje:21,iva_importe:315,total:1815,categoria:"Alquiler",estado:"pagada",trimestre:"T1",archivo_tipo:"pdf",archivo_nombre:"F-2025-022.pdf"},
  {id:"7",tipo:"ingreso",fecha:"25/02/2025",numero_factura:"ALN-2025-003",proveedor_cliente:"Charlotte Wilson",nif_cif:"",base_imponible:1240,iva_porcentaje:21,iva_importe:260.4,total:1500.4,categoria:"Servicios externos",estado:"pagada",trimestre:"T1",archivo_tipo:"image",archivo_nombre:"ALN-2025-003.jpg"},
];

// ═══════════════════════════════════════════════════════════
// VISTA: SUBIDA
// ═══════════════════════════════════════════════════════════
function ViewSubida({ onSaved, toast }) {
  const [files,   setFiles]   = useState([]);
  const [drag,    setDrag]    = useState(false);
  const [results, setResults] = useState({});
  const [saved,   setSaved]   = useState({});
  const inputRef = useRef();

  const addFiles = useCallback((nf) => {
    const arr = Array.from(nf).filter(f=>f.type.match(/pdf|jpeg|jpg|png/i)||f.name.match(/\.(pdf|jpg|jpeg|png)$/i));
    setFiles(p=>[...p,...arr.map(f=>({file:f,id:Math.random().toString(36).slice(2),status:"waiting"}))]);
  },[]);

  const onDrop = (e)=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files);};
  const removeFile = (id)=>{setFiles(p=>p.filter(f=>f.id!==id));setResults(p=>{const n={...p};delete n[id];return n;});};
  const upd = (id,k,v)=>setResults(p=>({...p,[id]:{...p[id],[k]:v}}));

  const processFile = async (item) => {
    setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"processing"}:f));
    try {
      const data = await extractWithAI(item.file);
      setResults(p=>({...p,[item.id]:data}));
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"done"}:f));
    } catch(e) {
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"error"}:f));
      toast("Error leyendo "+item.file.name,"err");
    }
  };

  const processAll = async () => { for(const it of files.filter(f=>f.status==="waiting"||f.status==="error")) await processFile(it); };

  const saveFactura = async (item) => {
    const data = results[item.id];
    setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"uploading"}:f));
    try {
      const supa = await db();
      const tipo = item.file.type.startsWith("image")?"image":"pdf";
      const path = `${Date.now()}_${item.file.name.replace(/\s+/g,"_")}`;

      const {error:upErr} = await supa.storage.from("facturas").upload(path,item.file,{contentType:item.file.type,upsert:true});
      if(upErr) throw upErr;
      const {data:{publicUrl}} = supa.storage.from("facturas").getPublicUrl(path);

      const fecha = data.fecha || "";
      const mes   = parseInt(fecha.split("/")[1]) || new Date().getMonth()+1;
      const anyo  = fecha.split("/")[2] || new Date().getFullYear().toString();
      const trimestre = mes<=3?"T1":mes<=6?"T2":mes<=9?"T3":"T4";

      const driveUrl = await subirADrive(item.file, trimestre, anyo);

      const {error:dbErr} = await supa.from("facturas").insert([{
        ...data,
        base_imponible: Number(data.base_imponible)||0,
        iva_porcentaje: Number(data.iva_porcentaje)||21,
        iva_importe:    Number(data.iva_importe)||0,
        total:          Number(data.total)||0,
        archivo_nombre: item.file.name,
        archivo_url:    publicUrl,
        archivo_tipo:   tipo,
        trimestre,
        drive_url:      driveUrl || null,
      }]);
      if(dbErr) throw dbErr;

      setSaved(p=>({...p,[item.id]:true}));
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"done"}:f));

      if(driveUrl) toast(`Guardado en Supabase y Drive (${trimestre} ${anyo}) ✓`);
      else toast("Guardado en Supabase ✓");

      onSaved();
    } catch(e) {
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"error"}:f));
      toast("Error: "+e.message,"err");
    }
  };

  const wc = files.filter(f=>f.status==="waiting"||f.status==="error").length;

  return (
    <div className="view">
      <div className="eyebrow">Módulo 2</div>
      <h1 className="view-title">Subir <em>facturas</em></h1>
      <div className={"upload-zone"+(drag?" drag":"")} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>inputRef.current.click()}>
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>addFiles(e.target.files)}/>
        <div className="up-icon">{I.upload}</div>
        <p className="up-title">Arrastra tus facturas aquí o <em>haz clic para seleccionar</em></p>
        <p className="up-sub">PDF, foto o imagen escaneada — varias a la vez</p>
        <div className="fmt-tags">{["PDF","JPG","PNG"].map(f=><span key={f} className="fmt-tag">{f}</span>)}</div>
      </div>

      {files.length>0 && (
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <span style={{fontSize:11,letterSpacing:".22em",textTransform:"uppercase",color:"#9C8E7A"}}>{files.length} archivo{files.length!==1?"s":""}</span>
            <button className="btn-sm" onClick={()=>{setFiles([]);setResults({});setSaved({});}}>Limpiar todo</button>
          </div>
          <div className="file-cards">
            {files.map(item=>(
              <div key={item.id} className={"fc "+item.status+(saved[item.id]?" saved":"")}>
                <div className="fc-thumb">{item.file.name.split(".").pop().toUpperCase()}</div>
                <div className="fc-info"><div className="fc-name">{item.file.name}</div><div className="fc-meta">{(item.file.size/1024).toFixed(1)} KB</div></div>
                <div className={"fc-st st-"+item.status}><span className="st-dot"/>
                  {item.status==="waiting"&&"En espera"}{item.status==="processing"&&"Leyendo con IA..."}
                  {item.status==="uploading"&&"Guardando..."}{item.status==="done"&&(saved[item.id]?"Guardado ✓":"Listo")}{item.status==="error"&&"Error"}
                </div>
                {item.status==="waiting"&&<button className="rm-btn" onClick={()=>removeFile(item.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg></button>}
              </div>
            ))}
          </div>
          {wc>0&&<button className="btn-ink" style={{width:"100%",justifyContent:"center",padding:17}} onClick={processAll}><span>{files.some(f=>f.status==="error")?"Reintentar lectura con IA":wc===1?"Leer factura con IA":`Leer ${wc} facturas con IA`}</span></button>}
        </>
      )}

      {Object.keys(results).length>0&&(
        <div style={{marginTop:36}}>
          <div style={{fontSize:11,letterSpacing:".22em",textTransform:"uppercase",color:"#9C8E7A",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>Revisa y guarda en Supabase<span style={{flex:1,height:".5px",background:"#D4C5A9",display:"block"}}/></div>
          {files.filter(f=>results[f.id]).map(item=>{
            const r=results[item.id],isSaved=saved[item.id];
            return (
              <div key={item.id} className={"result-card"+(isSaved?" saved-c":"")}>
                <div className="rc-hd">
                  <span className="rc-name">{item.file.name}</span>
                  <div style={{display:"flex",gap:7}}>
                    {isSaved&&<span className="badge badge-ok">✓ En Supabase</span>}
                    <span className={"badge badge-"+(r.tipo==="gasto"?"gasto":"ingreso")}>{r.tipo==="gasto"?"Gasto":"Ingreso"}</span>
                  </div>
                </div>
                <div className="rc-grid">
                  {[["Fecha","fecha"],["Nº Factura","numero_factura"],["Proveedor / Cliente","proveedor_cliente"],["NIF / CIF","nif_cif"],["Base imponible","base_imponible"],["IVA %","iva_porcentaje"],["IVA importe","iva_importe"],["Total","total"]].map(([lbl,fld])=>(
                    <div key={fld} className="rc-f"><div className="rc-lbl">{lbl}</div><input className="rc-inp" value={r[fld]??""} disabled={isSaved} onChange={e=>upd(item.id,fld,e.target.value)}/></div>
                  ))}
                  <div className="rc-f"><div className="rc-lbl">Tipo</div><select className="rc-sel" value={r.tipo||"gasto"} disabled={isSaved} onChange={e=>upd(item.id,"tipo",e.target.value)}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></div>
                  <div className="rc-f"><div className="rc-lbl">Categoría</div><select className="rc-sel" value={r.categoria||""} disabled={isSaved} onChange={e=>upd(item.id,"categoria",e.target.value)}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
                  <div className="rc-f"><div className="rc-lbl">Estado</div><select className="rc-sel" value={r.estado||"pendiente"} disabled={isSaved} onChange={e=>upd(item.id,"estado",e.target.value)}><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option></select></div>
                </div>
                {!isSaved&&(
                  <div className="rc-act">
                    <button className="btn-sm" onClick={()=>removeFile(item.id)}>Descartar</button>
                    <button className="btn-ink" onClick={()=>saveFactura(item)} disabled={["processing","uploading"].includes(item.status)}>
                      {I.upload}<span>Guardar en Supabase</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VISTA: LISTADO
// ═══════════════════════════════════════════════════════════
function ViewListado({ facturas, loading, onRefresh, toast }) {
  const [editingId,setEditingId] = useState(null);
  const [editData, setEditData]  = useState({});
  const [sortField,setSortField] = useState("creado_en");
  const [sortDir,  setSortDir]   = useState("desc");
  const [visor,    setVisor]     = useState(null);
  const [exporting,setExporting] = useState(false);
  const [filters,  setFilters]   = useState({busqueda:"",tipo:"",categoria:"",estado:"",fechaDesde:"",fechaHasta:""});

  const setF = (k,v)=>setFilters(p=>({...p,[k]:v}));
  const resetF = ()=>setFilters({busqueda:"",tipo:"",categoria:"",estado:"",fechaDesde:"",fechaHasta:""});
  const pD = (s)=>{const[d,m,y]=(s||"").split("/");return new Date(`${y}-${m}-${d}`);};

  const filtered = useMemo(()=>{
    let arr=[...facturas];
    if(filters.busqueda) arr=arr.filter(f=>(f.proveedor_cliente||"").toLowerCase().includes(filters.busqueda.toLowerCase())||(f.numero_factura||"").toLowerCase().includes(filters.busqueda.toLowerCase()));
    if(filters.tipo)     arr=arr.filter(f=>f.tipo===filters.tipo);
    if(filters.categoria)arr=arr.filter(f=>f.categoria===filters.categoria);
    if(filters.estado)   arr=arr.filter(f=>f.estado===filters.estado);
    if(filters.fechaDesde)arr=arr.filter(f=>f.fecha&&pD(f.fecha)>=new Date(filters.fechaDesde));
    if(filters.fechaHasta)arr=arr.filter(f=>f.fecha&&pD(f.fecha)<=new Date(filters.fechaHasta));
    arr.sort((a,b)=>{
      let va=a[sortField],vb=b[sortField];
      if(sortField==="total"){va=Number(va);vb=Number(vb);}
      if(sortField==="fecha"){va=pD(va);vb=pD(vb);}
      if(va<vb)return sortDir==="asc"?-1:1;
      if(va>vb)return sortDir==="asc"?1:-1;
      return 0;
    });
    return arr;
  },[facturas,filters,sortField,sortDir]);

  const toggleSort=(f)=>{if(sortField===f)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortField(f);setSortDir("asc");}};
  const startEdit=(f)=>{setEditingId(f.id);setEditData({...f});};
  const cancelEdit=()=>{setEditingId(null);setEditData({});};

  const saveEdit = async()=>{
    try{
      const supa=await db();
      const{error}=await supa.from("facturas").update({tipo:editData.tipo,fecha:editData.fecha,numero_factura:editData.numero_factura,proveedor_cliente:editData.proveedor_cliente,nif_cif:editData.nif_cif,categoria:editData.categoria,total:Number(editData.total),iva_porcentaje:Number(editData.iva_porcentaje),estado:editData.estado}).eq("id",editingId);
      if(error)throw error;
      setEditingId(null);toast("Factura actualizada ✓");onRefresh();
    }catch(e){toast("Error: "+e.message,"err");}
  };

  const deleteF=async(id)=>{
    if(!window.confirm("¿Eliminar esta factura?"))return;
    try{const supa=await db();const{error}=await supa.from("facturas").delete().eq("id",id);if(error)throw error;toast("Eliminada");onRefresh();}
    catch(e){toast("Error: "+e.message,"err");}
  };

  const downloadFile=(f)=>{ if(f.archivo_url)window.open(f.archivo_url,"_blank"); else window.alert("Sin archivo adjunto."); };
  const exportExcel=()=>{setExporting(true);try{buildExcel(facturas);}catch(e){window.alert("Error: "+e.message);}setExporting(false);};

  const tG=filtered.filter(f=>f.tipo==="gasto").reduce((s,f)=>s+Number(f.total),0);
  const tI=filtered.filter(f=>f.tipo==="ingreso").reduce((s,f)=>s+Number(f.total),0);
  const pend=filtered.filter(f=>f.estado==="pendiente").length;
  const Arr=({f})=>sortField===f?<span style={{marginLeft:4,opacity:.7}}>{sortDir==="asc"?"↑":"↓"}</span>:<span style={{marginLeft:4,opacity:.2}}>↕</span>;

  return (
    <div className="view">
      <div className="page-header" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:28}}>
        <div><div className="eyebrow">Módulo 3</div><h1 className="view-title" style={{marginBottom:0}}>Listado de <em>facturas</em></h1></div>
        <div style={{display:"flex",gap:9}}>
          <button className="btn-out" onClick={()=>window.alert("ZIP disponible en Netlify.")}>{I.zip}<span>ZIP</span></button>
          <button className="btn-ink" onClick={exportExcel} disabled={exporting}>{I.xl}<span>{exporting?"Generando...":"Exportar Excel"}</span></button>
        </div>
      </div>

      <div className="pills">
        <div className="pill"><span className="pill-dot" style={{background:"#C25A4A"}}/>Gastos<span className="pill-val">{fmt(tG)}</span></div>
        <div className="pill"><span className="pill-dot" style={{background:"#5A8A5E"}}/>Ingresos<span className="pill-val">{fmt(tI)}</span></div>
        <div className="pill"><span className="pill-dot" style={{background:"#B8962E"}}/>Pendientes<span className="pill-val">{pend}</span></div>
        <div className="pill"><span className="pill-dot" style={{background:"#2C2417"}}/>Total<span className="pill-val">{facturas.length} facturas</span></div>
      </div>

      <div className="fl-bar">
        <div className="fg" style={{minWidth:190}}><label className="fl">Buscar</label><input className="fi" placeholder="Proveedor, nº factura..." value={filters.busqueda} onChange={e=>setF("busqueda",e.target.value)}/></div>
        <div className="fg"><label className="fl">Tipo</label><select className="fs" value={filters.tipo} onChange={e=>setF("tipo",e.target.value)}><option value="">Todos</option><option value="gasto">Gastos</option><option value="ingreso">Ingresos</option></select></div>
        <div className="fg"><label className="fl">Categoría</label><select className="fs" value={filters.categoria} onChange={e=>setF("categoria",e.target.value)}><option value="">Todas</option>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div className="fg"><label className="fl">Estado</label><select className="fs" value={filters.estado} onChange={e=>setF("estado",e.target.value)}><option value="">Todos</option><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option></select></div>
        <div className="fg"><label className="fl">Desde</label><input type="date" className="fi" value={filters.fechaDesde} onChange={e=>setF("fechaDesde",e.target.value)}/></div>
        <div className="fg"><label className="fl">Hasta</label><input type="date" className="fi" value={filters.fechaHasta} onChange={e=>setF("fechaHasta",e.target.value)}/></div>
        <button className="btn-sm" onClick={resetF}>Limpiar</button>
      </div>

      <div className="twrap">
        <table>
          <thead><tr>
            <th>Tipo</th>
            <th className={`sort${sortField==="fecha"?" sorted":""}`} onClick={()=>toggleSort("fecha")}>Fecha<Arr f="fecha"/></th>
            <th>Nº Factura</th><th>Proveedor / Cliente</th><th>Categoría</th>
            <th className={`sort${sortField==="total"?" sorted":""}`} onClick={()=>toggleSort("total")}>Total<Arr f="total"/></th>
            <th>IVA</th><th>Estado</th><th>Archivo</th><th>Acciones</th>
          </tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={10}><div className="loading-row"><div className="spin"/><span>Cargando desde Supabase...</span></div></td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={10} className="empty-row">{facturas.length===0?"Aún no hay facturas — sube la primera en el módulo 2":"Sin resultados con estos filtros"}</td></tr>}
            {!loading&&filtered.map((f,i)=>{
              const isE=editingId===f.id,d=isE?editData:f;
              return(
                <tr key={f.id} className={"dr"+(isE?" editing":"")} style={{animationDelay:i*.025+"s"}}>
                  <td>{isE?<select className="is" value={d.tipo} onChange={e=>setEditData(p=>({...p,tipo:e.target.value}))}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select>:<span className={"badge badge-"+f.tipo}>{f.tipo==="gasto"?"Gasto":"Ingreso"}</span>}</td>
                  <td>{isE?<input className="ii" value={d.fecha||""} onChange={e=>setEditData(p=>({...p,fecha:e.target.value}))} style={{width:95}}/>:f.fecha}</td>
                  <td style={{color:"#9C8E7A",fontSize:13}}>{isE?<input className="ii" value={d.numero_factura||""} onChange={e=>setEditData(p=>({...p,numero_factura:e.target.value}))}/>:f.numero_factura}</td>
                  <td style={{fontWeight:500}}>{isE?<input className="ii" value={d.proveedor_cliente||""} onChange={e=>setEditData(p=>({...p,proveedor_cliente:e.target.value}))}/>:f.proveedor_cliente}</td>
                  <td style={{fontSize:12,color:"#5C4A2A"}}>{isE?<select className="is" value={d.categoria||""} onChange={e=>setEditData(p=>({...p,categoria:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select>:f.categoria}</td>
                  <td style={{fontWeight:500,color:f.tipo==="gasto"?"#8B3A2A":"#3A6B3E"}}>{isE?<input className="ii" type="number" value={d.total||0} onChange={e=>setEditData(p=>({...p,total:e.target.value}))} style={{width:85}}/>:fmt(f.total)}</td>
                  <td style={{fontSize:13,color:"#9C8E7A"}}>{isE?<input className="ii" value={d.iva_porcentaje||21} onChange={e=>setEditData(p=>({...p,iva_porcentaje:e.target.value}))} style={{width:36}}/>:(f.iva_porcentaje||21)+"%"}</td>
                  <td>{isE?<select className="is" value={d.estado||"pendiente"} onChange={e=>setEditData(p=>({...p,estado:e.target.value}))}><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option></select>:<span className={"badge badge-"+f.estado}><span className={"e-dot dot-"+f.estado}/>{f.estado}</span>}</td>
                  <td><span className={"file-tag"+(f.archivo_nombre?" has":"")}>{f.archivo_tipo==="image"?<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>:<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>}{f.archivo_tipo?f.archivo_tipo.toUpperCase():"—"}</span></td>
                  <td><div className="acts">
                    {isE?<><button className="ib sv" onClick={saveEdit}>{I.ok}</button><button className="ib" onClick={cancelEdit}>{I.x}</button></>
                    :<><button className="ib eye" onClick={()=>setVisor(f)}>{I.eye}</button><button className="ib dl" onClick={()=>downloadFile(f)}>{I.down}</button><button className="ib" onClick={()=>startEdit(f)}>{I.edit}</button><button className="ib del" onClick={()=>deleteF(f.id)}>{I.del}</button></>}
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="tfoot">
          <span className="tfoot-count">{filtered.length} factura{filtered.length!==1?"s":""}</span>
          <div className="tfoot-tots">
            <div className="tfoot-it"><span className="tfoot-lbl">Gastos</span><span className="tfoot-val" style={{color:"#8B3A2A"}}>{fmt(tG)}</span></div>
            <div className="tfoot-it"><span className="tfoot-lbl">Ingresos</span><span className="tfoot-val" style={{color:"#3A6B3E"}}>{fmt(tI)}</span></div>
            <div className="tfoot-it"><span className="tfoot-lbl">Balance</span><span className="tfoot-val" style={{color:tI-tG>=0?"#3A6B3E":"#8B3A2A"}}>{fmt(tI-tG)}</span></div>
          </div>
        </div>
      </div>

      {visor&&(
        <div className="overlay" onClick={()=>setVisor(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <div><div className="modal-ttl">{visor.numero_factura}</div><div className="modal-meta">{visor.proveedor_cliente} — {visor.fecha}</div></div>
              <button className="modal-x" onClick={()=>setVisor(null)}>{I.x}</button>
            </div>
            <div className="modal-body">
              <div className="modal-prev">
                {visor.archivo_url ? (visor.archivo_tipo==="image"?<img src={visor.archivo_url} alt="Factura"/>:<iframe src={visor.archivo_url} width="100%" height="420px" style={{border:"none"}} title="PDF"/>)
                : <div className="modal-ph">{I.pdf}<span>{visor.archivo_nombre||"Sin archivo"}</span><small>Disponible tras subir desde el módulo 2</small></div>}
              </div>
              <div className="modal-data">
                <div className="modal-dt">Datos extraídos</div>
                {[["Tipo",visor.tipo==="gasto"?"Gasto":"Ingreso"],["Fecha",visor.fecha],["Nº Factura",visor.numero_factura],["Proveedor",visor.proveedor_cliente],["NIF / CIF",visor.nif_cif||"—"],["Base imponible",fmt(visor.base_imponible)],["IVA",(visor.iva_porcentaje||21)+"% — "+fmt(visor.iva_importe)],["Total",fmt(visor.total)],["Categoría",visor.categoria],["Estado",visor.estado]].map(([lbl,val])=>(
                  <div key={lbl} className="mf"><div className="mf-lbl">{lbl}</div><div className="mf-val" style={{color:lbl==="Total"?(visor.tipo==="ingreso"?"#3A6B3E":"#8B3A2A"):lbl==="Estado"?(visor.estado==="pagada"?"#3A6B3E":"#8B6914"):"#2C2417"}}>{val}</div></div>
                ))}
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn-sm" onClick={()=>setVisor(null)}>Cerrar</button>
              <button className="btn-ink" onClick={()=>downloadFile(visor)}>{I.down}<span>Descargar</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VISTA: DASHBOARD
// ═══════════════════════════════════════════════════════════
const MOCK_2024=[{mes:"Ene",g:3200,i:4100},{mes:"Feb",g:2800,i:3600},{mes:"Mar",g:4100,i:5200},{mes:"Abr",g:3600,i:4800},{mes:"May",g:3900,i:5100},{mes:"Jun",g:4200,i:6200},{mes:"Jul",g:2900,i:3800},{mes:"Ago",g:2100,i:2900},{mes:"Sep",g:3800,i:5400},{mes:"Oct",g:4500,i:6100},{mes:"Nov",g:5200,i:7200},{mes:"Dic",g:4800,i:6800}];
const TRIM={T1:[0,1,2],T2:[3,4,5],T3:[6,7,8],T4:[9,10,11]};

function ViewDashboard({ facturas }) {
  const [vista,  setVista]  = useState("resumen");
  const [periodo,setPeriodo]= useState("mensual");
  const [cSub,   setCSub]   = useState("ingresos");

  const gas=facturas.length>0?facturas.filter(f=>f.tipo==="gasto"):MOCK.filter(f=>f.tipo==="gasto");
  const ing=facturas.length>0?facturas.filter(f=>f.tipo==="ingreso"):MOCK.filter(f=>f.tipo==="ingreso");
  const tG=gas.reduce((s,f)=>s+Number(f.total),0);
  const tI=ing.reduce((s,f)=>s+Number(f.total),0);
  const bal=tI-tG;
  const ivaR=ing.reduce((s,f)=>s+Number(f.iva_importe),0);
  const ivaS=gas.reduce((s,f)=>s+Number(f.iva_importe),0);
  const ivaN=ivaR-ivaS;
  const pend=(facturas.length>0?facturas:MOCK).filter(f=>f.estado==="pendiente");

  const chartData = useMemo(()=>{
    const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    if(periodo==="mensual"){
      return meses.map((mes,i)=>{
        const g=facturas.filter(f=>f.fecha&&parseInt(f.fecha.split("/")[1])===i+1&&f.tipo==="gasto").reduce((s,f)=>s+Number(f.total),0);
        const iv=facturas.filter(f=>f.fecha&&parseInt(f.fecha.split("/")[1])===i+1&&f.tipo==="ingreso").reduce((s,f)=>s+Number(f.total),0);
        return {mes, gastos:g||MOCK_2024[i].g, ingresos:iv||MOCK_2024[i].i, gastos24:MOCK_2024[i].g, ingresos24:MOCK_2024[i].i};
      });
    }
    if(periodo==="trimestral"){
      return Object.entries(TRIM).map(([t,idxs])=>({
        mes:t,
        gastos:idxs.reduce((s,i)=>s+MOCK_2024[i].g,0),
        ingresos:idxs.reduce((s,i)=>s+MOCK_2024[i].i,0),
        gastos24:idxs.reduce((s,i)=>s+MOCK_2024[i].g*.85,0),
        ingresos24:idxs.reduce((s,i)=>s+MOCK_2024[i].i*.85,0),
      }));
    }
    return [{mes:"2025",gastos:tG||47200,ingresos:tI||68300},{mes:"2024",gastos:42000,ingresos:61000}];
  },[facturas,periodo,tG,tI]);

  const catData = useMemo(()=>{
    const src = vista==="ingresos" ? ing : gas;
    const cats=[...new Set(src.map(f=>f.categoria))];
    return cats.map(c=>({name:c,value:src.filter(f=>f.categoria===c).reduce((s,f)=>s+Number(f.total),0)})).sort((a,b)=>b.value-a.value).slice(0,7);
  },[facturas,vista]);

  const topProv = useMemo(()=>Object.entries(gas.reduce((acc,f)=>{acc[f.proveedor_cliente]=(acc[f.proveedor_cliente]||0)+Number(f.total);return acc;},{})).map(([n,t])=>({n,t})).sort((a,b)=>b.t-a.t).slice(0,5),[gas]);
  const maxProv = topProv[0]?.t||1;

  const ivaData = Object.entries(TRIM).map(([t,idxs])=>{
    const tIvaS=idxs.reduce((s,i)=>s+MOCK_2024[i].g*.21,0);
    const tIvaR=idxs.reduce((s,i)=>s+MOCK_2024[i].i*.21,0);
    return {t,net:tIvaR-tIvaS};
  });

  const barSerie = vista==="gastos"?"gastos":vista==="ingresos"?"ingresos":cSub;
  const barCol   = {gastos:"#C25A4A",ingresos:"#5A8A5E",gastos24:"rgba(194,90,74,.35)",ingresos24:"rgba(90,138,94,.35)"};

  const kpis = vista==="resumen"?[
    {lbl:"Total ingresos",val:fmt(tI),sub:`vs ${fmt(61000)} año anterior`,delta:"11.8",up:true,ac:"#5A8A5E",cl:"#3A6B3E"},
    {lbl:"Total gastos",val:fmt(tG),sub:`vs ${fmt(42000)} año anterior`,delta:"12.4",up:false,ac:"#C25A4A",cl:"#8B3A2A"},
    {lbl:"Balance",val:fmt(bal),sub:"ingresos − gastos",ac:bal>=0?"#5A8A5E":"#C25A4A",cl:bal>=0?"#3A6B3E":"#8B3A2A"},
    {lbl:"IVA neto a pagar",val:fmt(Math.abs(ivaN)),sub:`↑ Repercutido: ${fmt(ivaR)}\n↓ Soportado: ${fmt(ivaS)}`,ac:"#8B6914",cl:"#8B6914"},
    {lbl:"Facturas pendientes",val:pend.length,sub:fmt(pend.reduce((s,f)=>s+Number(f.total),0))+" en espera",ac:"#B8962E",cl:"#8B6914"},
  ]:vista==="gastos"?[
    {lbl:"Total gastos",val:fmt(tG),sub:`vs ${fmt(42000)} año anterior`,delta:"12.4",up:false,ac:"#C25A4A",cl:"#8B3A2A"},
    {lbl:"Mayor categoría",val:catData[0]?.name||"—",sub:fmt(catData[0]?.value||0),ac:"#B8962E",cl:"#8B6914"},
    {lbl:"Facturas gasto",val:gas.length,sub:"en el período",ac:"#2C2417",cl:"#2C2417"},
    {lbl:"IVA soportado",val:fmt(ivaS),sub:"deducible",ac:"#7A6A50",cl:"#5C4A2A"},
  ]:[
    {lbl:"Total ingresos",val:fmt(tI),sub:`vs ${fmt(61000)} año anterior`,delta:"11.8",up:true,ac:"#5A8A5E",cl:"#3A6B3E"},
    {lbl:"Ticket medio",val:fmt(ing.length>0?tI/ing.length:0),sub:"por factura",ac:"#B8962E",cl:"#8B6914"},
    {lbl:"Facturas ingreso",val:ing.length,sub:"en el período",ac:"#2C2417",cl:"#2C2417"},
    {lbl:"IVA repercutido",val:fmt(ivaR),sub:"a declarar",ac:"#7A6A50",cl:"#5C4A2A"},
  ];

  const CTT = ({active,payload,label})=>{
    if(!active||!payload?.length)return null;
    return <div className="ctooltip"><div className="ctt-lbl">{label}</div>{payload.map((p,i)=><div key={i} className="ctt-row"><span className="ctt-dot" style={{background:p.color}}/>{p.name}: {fmtK(p.value)}</div>)}</div>;
  };

  return (
    <div className="view">
      <div className="eyebrow">Módulo 4</div>
      <h1 className="view-title" style={{marginBottom:20}}>Dashboard <em>financiero</em></h1>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:14,marginBottom:26}}>
        <div className="tabs">
          {[["resumen","Resumen global"],["gastos","Gastos"],["ingresos","Ingresos"]].map(([k,l])=>(
            <button key={k} className={"tab"+(vista===k?" active":"")} onClick={()=>setVista(k)}>{l}</button>
          ))}
        </div>
        <div className="period-tabs">
          {[["mensual","Mensual"],["trimestral","Trimestral"],["anual","Anual"]].map(([k,l])=>(
            <button key={k} className={"ptab"+(periodo===k?" active":"")} onClick={()=>setPeriodo(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k,i)=>(
          <div key={i} className="kpi" style={{"--ac":k.ac,"--cl":k.cl,animationDelay:i*.06+"s"}}>
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub" style={{whiteSpace:"pre-line"}}>{k.sub}</div>
            {k.delta&&<div className={"kpi-delta "+(k.up?"dpos":"dneg")}>{k.up?"▲":"▼"} {k.delta}% vs año anterior</div>}
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="ch-card full">
          <div className="ch-title">Evolución {periodo}</div>
          <div className="ch-sub" style={{marginBottom:0}}>2025 vs 2024 — mismo período</div>
          {vista==="resumen"&&<div className="ch-subtabs"><button className={"ch-stab"+(cSub==="ingresos"?" active":"")} onClick={()=>setCSub("ingresos")}>Ingresos</button><button className={"ch-stab"+(cSub==="gastos"?" active":"")} onClick={()=>setCSub("gastos")}>Gastos</button></div>}
          {vista!=="resumen"&&<div style={{height:22}}/>}
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} barGap={4} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#D4C5A9" vertical={false}/>
              <XAxis dataKey="mes" tick={{fontFamily:"Cormorant Garamond",fontSize:13,fill:"#4A3820"}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={fmtK} tick={{fontFamily:"Cormorant Garamond",fontSize:13,fill:"#4A3820"}} axisLine={false} tickLine={false}/>
              <Tooltip content={<CTT/>}/>
              <Bar dataKey={barSerie} name={barSerie==="ingresos"?"Ingresos 2025":"Gastos 2025"} fill={barCol[barSerie]} radius={[2,2,0,0]}/>
              {periodo!=="anual"&&<Bar dataKey={barSerie+"24"} name={barSerie==="ingresos"?"Ingresos 2024":"Gastos 2024"} fill={barCol[barSerie+"24"]} radius={[2,2,0,0]}/>}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="ch-card">
          <div className="ch-title">Por categoría</div>
          <div className="ch-sub">{vista==="ingresos"?"Distribución ingresos":"Distribución gastos"}</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" innerRadius="42%" outerRadius="72%" paddingAngle={3} dataKey="value">
                {catData.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={(v)=>fmt(v)} contentStyle={{fontFamily:"Cormorant Garamond",background:"#2C2417",border:"none",color:"#F5F0E8",fontSize:13}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:"flex",flexWrap:"wrap",gap:"5px 14px",marginTop:8}}>
            {catData.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:13,color:"#2C2417",fontFamily:"Cormorant Garamond"}}><span style={{width:7,height:7,borderRadius:"50%",background:CAT_COLORS[i%CAT_COLORS.length],flexShrink:0,display:"inline-block"}}/>{d.name}</div>)}
          </div>
        </div>

        <div className="ch-card">
          <div className="ch-title">Facturas pendientes</div>
          <div className="ch-sub">Sin liquidar</div>
          {pend.slice(0,4).map((p,i)=>(
            <div key={i} className="pend-row">
              <div><div className="pend-n">{p.proveedor_cliente}</div><div className="pend-d">{p.fecha}</div></div>
              <div style={{textAlign:"right"}}>
                <div className="pend-amt" style={{color:p.tipo==="ingreso"?"#3A6B3E":"#8B3A2A"}}>{fmt(p.total)}</div>
                <span className={"badge badge-"+(p.tipo==="gasto"?"gasto":"ingreso")} style={{fontSize:9}}>{p.tipo}</span>
              </div>
            </div>
          ))}
          {pend.length===0&&<p style={{fontSize:14,color:"#9C8E7A",fontStyle:"italic",paddingTop:16}}>No hay facturas pendientes ✓</p>}
        </div>
      </div>

      {periodo==="trimestral"&&(
        <div className="ch-card" style={{marginBottom:18}}>
          <div className="ch-title">Comparativa trimestral</div>
          <div className="ch-sub">2025 vs 2024 — por trimestre</div>
          <div style={{overflowX:"auto"}}>
            <table className="trim-table" style={{minWidth:560}}>
              <thead><tr>{["","T1","T2","T3","T4"].map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
              <tbody>
                {[{lbl:"Ingresos 2025",key:"i",yr:MOCK_2024,m:1.15,c:"#3A6B3E"},{lbl:"Ingresos 2024",key:"i",yr:MOCK_2024,m:1,c:"rgba(58,107,62,.5)"},{lbl:"Gastos 2025",key:"g",yr:MOCK_2024,m:1.12,c:"#8B3A2A"},{lbl:"Gastos 2024",key:"g",yr:MOCK_2024,m:1,c:"rgba(139,58,42,.5)"}].map((row,ri)=>(
                  <tr key={ri} style={{borderBottom:ri===1?"1px solid #D4C5A9":undefined}}>
                    <td style={{textAlign:"left",color:row.c,fontStyle:row.m===1?"italic":"normal"}}>{row.lbl}</td>
                    {Object.values(TRIM).map((idxs,ti)=>{
                      const val=idxs.reduce((s,i)=>s+row.yr[i][row.key]*row.m,0);
                      const base=idxs.reduce((s,i)=>s+row.yr[i][row.key],0);
                      const delta=((val-base)/base*100).toFixed(0);
                      return <td key={ti} style={{color:row.c}}>{fmtK(val)}{row.m!==1&&<span style={{fontSize:11,marginLeft:5,color:(row.key==="i"?Number(delta)>=0:Number(delta)<=0)?"#2E6B32":"#8B3A2A"}}>{Number(delta)>=0?"▲":"▼"}{Math.abs(delta)}%</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="ch-card">
          <div className="ch-title">IVA acumulado</div>
          <div className="ch-sub">Por trimestre — 2025</div>
          <div className="iva-grid">
            {ivaData.map(d=>(
              <div key={d.t} className="iva-c">
                <div className="iva-lbl">{d.t}</div>
                <div className="iva-val">{fmtK(d.net)}</div>
                <div className="iva-s">{d.net>=0?"a pagar":"a devolver"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="ch-card">
          <div className="ch-title">Top proveedores</div>
          <div className="ch-sub">Por volumen de gasto</div>
          {topProv.map((p,i)=>(
            <div key={i} className="prov-row">
              <span className="prov-rank">0{i+1}</span>
              <div className="prov-bw"><span className="prov-nm">{p.n}</span><div className="prov-bar"><div className="prov-fill" style={{width:`${(p.t/maxProv)*100}%`}}/></div></div>
              <span className="prov-tot">{fmtK(p.t)}</span>
            </div>
          ))}
          {topProv.length===0&&<p style={{fontSize:14,color:"#9C8E7A",fontStyle:"italic",paddingTop:16}}>Sin datos de proveedores aún</p>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VISTA: EXPORTAR
// ═══════════════════════════════════════════════════════════
function ViewExportar({ facturas, toast }) {
  const [scope,     setScope]     = useState("todas");
  const [trimestre, setTrimestre] = useState("T1");
  const [prevTab,   setPrevTab]   = useState("resumen");
  const [exporting, setExporting] = useState(false);

  const data = scope==="trimestre" ? facturas.filter(f=>f.trimestre===trimestre) : facturas;
  const gas  = data.filter(f=>f.tipo==="gasto");
  const ing  = data.filter(f=>f.tipo==="ingreso");
  const tI   = ing.reduce((s,f)=>s+Number(f.total),0);
  const tG   = gas.reduce((s,f)=>s+Number(f.total),0);
  const ivaR = ing.reduce((s,f)=>s+Number(f.iva_importe),0);
  const ivaS = gas.reduce((s,f)=>s+Number(f.iva_importe),0);
  const pend = data.filter(f=>f.estado==="pendiente").length;

  const trimData = ["T1","T2","T3","T4"].map(t=>({
    t,
    ing:facturas.filter(f=>f.tipo==="ingreso"&&f.trimestre===t).reduce((s,f)=>s+Number(f.total),0),
    gas:facturas.filter(f=>f.tipo==="gasto"&&f.trimestre===t).reduce((s,f)=>s+Number(f.total),0),
    ivaR:facturas.filter(f=>f.tipo==="ingreso"&&f.trimestre===t).reduce((s,f)=>s+Number(f.iva_importe),0),
    ivaS:facturas.filter(f=>f.tipo==="gasto"&&f.trimestre===t).reduce((s,f)=>s+Number(f.iva_importe),0),
  }));

  const doExport=()=>{setExporting(true);try{buildExcel(data);}catch(e){window.alert("Error: "+e.message);}setExporting(false);};
  const prevData = prevTab==="gastos"?gas:prevTab==="ingresos"?ing:data;

  return (
    <div className="view">
      <div className="eyebrow">Módulo 5</div>
      <h1 className="view-title">Exportar <em>datos</em></h1>

      <div className="exp-bar">
        <span className="exp-lbl">Exportar</span>
        {[["todas","Todas las facturas"],["trimestre","Por trimestre"]].map(([k,l])=>(
          <button key={k} className={"scope-btn"+(scope===k?" active":"")} onClick={()=>setScope(k)}>{l}</button>
        ))}
        {scope==="trimestre"&&<select className="trim-sel" value={trimestre} onChange={e=>setTrimestre(e.target.value)}>{["T1","T2","T3","T4"].map(t=><option key={t} value={t}>{t} — 2025</option>)}</select>}
        <div style={{marginLeft:"auto",display:"flex",gap:9}}>
          <button className="btn-out" onClick={()=>window.alert("ZIP disponible en Netlify con Supabase Storage.")}>{I.zip}<span>Descargar ZIP</span></button>
          <button className="btn-ink" onClick={doExport} disabled={exporting}>{I.xl}<span>{exporting?"Generando...":"Descargar Excel"}</span></button>
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:11,letterSpacing:".22em",textTransform:"uppercase",color:"#5C4A2A",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>Previsualización — {scope==="trimestre"?trimestre:"todas las facturas"}<span style={{flex:1,height:".5px",background:"#D4C5A9",display:"block"}}/></div>

        <div className="sum-grid">
          {[{lbl:"Total ingresos",val:fmt(tI),c:"#3A6B3E"},{lbl:"Total gastos",val:fmt(tG),c:"#8B3A2A"},{lbl:"Balance",val:fmt(tI-tG),c:tI-tG>=0?"#3A6B3E":"#8B3A2A"},{lbl:"IVA repercutido",val:fmt(ivaR),c:"#8B6914"},{lbl:"IVA soportado",val:fmt(ivaS),c:"#5C4A2A"},{lbl:"IVA neto",val:fmt(ivaR-ivaS),c:ivaR-ivaS>=0?"#8B3A2A":"#3A6B3E"},{lbl:"Pendientes",val:pend,c:"#B8962E"},{lbl:"Total facturas",val:data.length,c:"#2C2417"}].map((k,i)=>(
            <div key={i} className="sum-c"><div className="sum-lbl">{k.lbl}</div><div className="sum-val" style={{color:k.c}}>{k.val}</div></div>
          ))}
        </div>

        <div className="prev-tabs">
          {[["resumen","Resumen"],["ingresos","Ingresos"],["gastos","Gastos"],["trimestres","Por trimestre"]].map(([k,l])=>(
            <button key={k} className={"prev-tab"+(prevTab===k?" active":"")} onClick={()=>setPrevTab(k)}>{l}</button>
          ))}
        </div>

        {prevTab==="trimestres"?(
          <div style={{overflowX:"auto"}}>
            <table className="trim-table" style={{minWidth:500}}>
              <thead><tr>{["Trimestre","Ingresos","Gastos","Balance","IVA Rep.","IVA Sop.","IVA Neto"].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>{trimData.map(d=>(
                <tr key={d.t}>
                  <td>{d.t}</td>
                  <td style={{color:"#3A6B3E"}}>{fmt(d.ing)}</td>
                  <td style={{color:"#8B3A2A"}}>{fmt(d.gas)}</td>
                  <td style={{color:d.ing-d.gas>=0?"#3A6B3E":"#8B3A2A"}}>{fmt(d.ing-d.gas)}</td>
                  <td>{fmt(d.ivaR)}</td><td>{fmt(d.ivaS)}</td>
                  <td style={{fontWeight:500,color:d.ivaR-d.ivaS>=0?"#8B3A2A":"#3A6B3E"}}>{fmt(d.ivaR-d.ivaS)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ):(
          <div style={{overflowX:"auto"}}>
            <table className="trim-table" style={{minWidth:700}}>
              <thead><tr>{["Tipo","Fecha","Nº Factura","Proveedor/Cliente","Total","Categoría","Estado"].map(h=><th key={h} style={{textAlign:h==="Total"?"right":"left"}}>{h}</th>)}</tr></thead>
              <tbody>
                {prevData.slice(0,8).map((f,i)=>(
                  <tr key={i}>
                    <td><span className={"badge badge-"+f.tipo}>{f.tipo==="gasto"?"Gasto":"Ingreso"}</span></td>
                    <td>{f.fecha}</td>
                    <td style={{color:"#9C8E7A",fontSize:12}}>{f.numero_factura}</td>
                    <td style={{fontWeight:500}}>{f.proveedor_cliente}</td>
                    <td style={{color:f.tipo==="ingreso"?"#3A6B3E":"#8B3A2A",fontWeight:500}}>{fmt(f.total)}</td>
                    <td style={{fontSize:12}}>{f.categoria}</td>
                    <td style={{color:f.estado==="pagada"?"#3A6B3E":"#8B6914"}}>{f.estado==="pagada"?"✓ Pagada":"⏳ Pendiente"}</td>
                  </tr>
                ))}
                {prevData.length>8&&<tr><td colSpan={7} style={{textAlign:"center",color:"#9C8E7A",fontStyle:"italic",fontSize:13}}>… y {prevData.length-8} facturas más en el Excel</td></tr>}
                {prevData.length===0&&<tr><td colSpan={7} style={{textAlign:"center",color:"#9C8E7A",fontStyle:"italic",fontSize:13,padding:24}}>Sin facturas para este período</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <div className="sh-info">
          <span style={{fontSize:11,letterSpacing:".12em",textTransform:"uppercase",color:"#5C4A2A",marginRight:4}}>El Excel incluye:</span>
          {[{lbl:"Resumen",c:"#2C2417"},{lbl:"Ingresos",c:"#3A6B3E"},{lbl:"Gastos",c:"#8B3A2A"}].map(s=>(
            <div key={s.lbl} className="sh-tag"><span style={{width:6,height:6,borderRadius:"50%",background:s.c,display:"inline-block"}}/>{s.lbl}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function AtelierApp() {
  const [vista,    setVista]    = useState("subida");
  const [facturas, setFacturas] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [toast,    setToast]    = useState(null);

  const showToast = useCallback((msg, type="ok")=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500); },[]);

  const cargar = useCallback(async()=>{
    setLoading(true);
    try {
      const supa = await db();
      const {data,error} = await supa.from("facturas").select("*").order("creado_en",{ascending:false});
      if(error) throw error;
      setFacturas(data||[]);
    } catch(e) {
      setFacturas([]);
    }
    setLoading(false);
  },[]);

  useEffect(()=>{ cargar(); },[cargar]);

  const NAV = [
    {id:"subida",   label:"Subir facturas", icon:I.upload},
    {id:"listado",  label:"Listado",         icon:I.list},
    {id:"dashboard",label:"Dashboard",       icon:I.dash},
    {id:"exportar", label:"Exportar",        icon:I.export},
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="sb-mono">N</div>
            <div className="sb-name">Atelier La Nonna</div>
            <div className="sb-sub">Gestor de facturas</div>
          </div>
          <nav className="sb-nav">
            {NAV.map(n=>(
              <div key={n.id} className={"sb-item"+(vista===n.id?" active":"")} onClick={()=>setVista(n.id)}>
                {n.icon}<span>{n.label}</span>
              </div>
            ))}
          </nav>
          <div className="sb-footer"><span className="sb-dot"/>Supabase conectado</div>
        </aside>
        <main className="main">
          {vista==="subida"    && <ViewSubida    onSaved={cargar} toast={showToast}/>}
          {vista==="listado"   && <ViewListado   facturas={facturas} loading={loading} onRefresh={cargar} toast={showToast}/>}
          {vista==="dashboard" && <ViewDashboard facturas={facturas}/>}
          {vista==="exportar"  && <ViewExportar  facturas={facturas} toast={showToast}/>}
        </main>
      </div>
      {toast&&<div className={"toast toast-"+toast.type}>{toast.msg}</div>}
    </>
  );
}
