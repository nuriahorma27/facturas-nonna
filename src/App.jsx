import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Supabase (npm package) ───────────────────────────────────
import { createClient } from "@supabase/supabase-js";
const _sb = createClient(
  "https://jtqfxakabthzakmhncrw.supabase.co",
  "sb_publishable_Wr-dnT92OLrYWsqhTrr4mw_F88RdJ2p",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "atelier_session",
    }
  }
);
async function db() { return _sb; }

// ── Google Drive via Apps Script ─────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxjrld-NMSKvIiFm_S6jG8Rg2lqBSTmZ1aws7P22A8mhKsXuyT67j0RE1SoTMmHEVq8GQ/exec";

async function subirADrive(file, trimestre, anyo, tipo) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT") return null;
  try {
    const isPdf = file.type === "application/pdf" || file.name.match(/\.pdf$/i);
    // Comprimir imágenes antes de enviar para no superar el límite del serverless (~4MB)
    const fileToSend = isPdf ? file : await compressImage(file, 2000, 0.88);
    const mimeOut   = isPdf ? "application/pdf" : "image/jpeg";
    const nombreOut = isPdf ? file.name : file.name.replace(/\.[^.]+$/, ".jpg");

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(fileToSend);
    });

    const resp = await fetch("/api/ai-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "drive-upload",
        appsScriptUrl: APPS_SCRIPT_URL,
        file: base64,
        nombre: nombreOut,
        mimeType: mimeOut,
        trimestre,
        anyo,
        tipo: tipo || "gasto",
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || "Apps Script error");
    return data.fileUrl || true;
  } catch(e) {
    throw new Error("Drive: " + e.message);
  }
}

const CATS = ["Telas y materiales","Transporte y envíos","Marketing y publicidad","Equipamiento y maquinaria","Servicios externos","Nóminas","Alquiler","Suministros","Otros"];
const CAT_COLORS = ["#B8962E","#C4A882","#8B6914","#D4AF5A","#5C4A2A","#9C8E7A","#7A6A50","#D4C5A9","#E8DFC8"];
const fmt  = (n) => Number(n).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2})+" €";
const fmtK = (n) => Math.abs(n)>=1000 ? (n/1000).toFixed(1).replace(".",",")+"k €" : Number(n).toFixed(0)+" €";

// Cálculo de IVA centralizado — prioridad: base×pct > iva_importe almacenado > total/(1+pct)
const calcIva = (f) => {
  const base = Number(f.base_imponible)||0;
  const pct  = (Number(f.iva_porcentaje)||21)/100;
  if(base>0) return Math.round(base*pct*100)/100;
  const iv = Number(f.iva_importe);
  if(iv>0) return iv;
  const tot = Number(f.total)||0;
  if(tot>0) return Math.round((tot - tot/(1+pct))*100)/100;
  return 0;
};

// Calcula la base imponible real de una factura
const calcBase = (f) => {
  const base = Number(f.base_imponible)||0;
  if(base>0) return base;
  const tot = Number(f.total)||0;
  const pct = (Number(f.iva_porcentaje)||21)/100;
  return tot>0 ? Math.round(tot/(1+pct)*100)/100 : 0;
};

// Mueve el archivo de una factura a la subcarpeta "Eliminadas" en Drive
async function moverArchivoAEliminadas(factura) {
  if (!factura.drive_url || !APPS_SCRIPT_URL || APPS_SCRIPT_URL === "PEGA_AQUI_TU_URL_DE_APPS_SCRIPT") return;
  const match = (factura.drive_url || "").match(/\/file\/d\/([^/?]+)/);
  if (!match) return;
  const fileId = match[1];
  const fecha = factura.fecha || "";
  const mes = parseInt(fecha.split("/")[1]) || new Date().getMonth()+1;
  const anyo = fecha.split("/")[2] || new Date().getFullYear().toString();
  const trimestre = mes<=3?"T1":mes<=6?"T2":mes<=9?"T3":"T4";
  try {
    await fetch("/api/ai-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "drive-move",
        appsScriptUrl: APPS_SCRIPT_URL,
        fileId,
        trimestre,
        anyo,
        tipo: factura.tipo || "gasto",
      }),
    });
  } catch(e) { /* silently ignore — el registro se elimina igualmente */ }
}

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
.sb-name{font-size:13px;letter-spacing:.25em;text-transform:uppercase;color:#D4C5A9}
.sb-sub{font-size:10px;color:#9C8E7A;margin-top:2px;letter-spacing:.1em}
.sb-nav{flex:1;padding:16px 0}
.sb-item{display:flex;align-items:center;gap:12px;padding:14px 24px;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s;border-left:2px solid transparent}
.sb-item:hover{color:#EDE5D0;background:rgba(255,255,255,.05)}
.sb-item.active{color:#F5F0E8;border-left-color:#B8962E;background:rgba(184,150,46,.1)}
.sb-item svg{width:16px;height:16px;flex-shrink:0}
.sb-footer{padding:20px 24px;border-top:1px solid rgba(255,255,255,.08);font-size:10px;color:#5C4A2A;letter-spacing:.1em}
.sb-dot{width:5px;height:5px;border-radius:50%;background:#7BAE7F;box-shadow:0 0 6px #7BAE7F;display:inline-block;margin-right:6px;animation:pulse 2s ease-in-out infinite}
.main{flex:1;overflow:auto;background:#EDE5D0}
.view{padding:48px 44px;animation:fadeUp .5s ease both}

.eyebrow{font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:#B8962E;margin-bottom:8px;display:flex;align-items:center;gap:10px}
.eyebrow::before{content:'';width:20px;height:.5px;background:#B8962E}
.view-title{font-size:38px;font-weight:300;margin-bottom:32px}
.view-title em{font-style:italic;color:#8B6914}

.btn-ink{padding:11px 26px;background:#2C2417;border:none;font-family:'Cormorant Garamond',serif;font-size:15px;letter-spacing:.22em;text-transform:uppercase;color:#F5F0E8;cursor:pointer;position:relative;overflow:hidden;transition:letter-spacing .3s;display:flex;align-items:center;gap:8px}
.btn-ink::before{content:'';position:absolute;inset:0;background:#8B6914;transform:translateX(-100%);transition:transform .3s ease}
.btn-ink:hover::before{transform:translateX(0)}
.btn-ink:hover{letter-spacing:.3em}
.btn-ink span,.btn-ink svg{position:relative;z-index:1}
.btn-ink:disabled{opacity:.5;cursor:not-allowed}
.btn-ink:disabled::before{display:none}
.btn-out{padding:11px 22px;background:none;border:1px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#5C4A2A;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:8px}
.btn-out:hover{border-color:#B8962E;color:#8B6914}
.btn-sm{padding:8px 18px;background:none;border:.5px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s}
.btn-sm:hover{border-color:#2C2417;color:#2C2417}

.toast{position:fixed;bottom:28px;right:28px;padding:14px 22px;font-family:'Cormorant Garamond',serif;font-size:16px;z-index:9999;animation:fadeUp .3s ease both;min-width:200px}
.toast-ok{background:#2C2417;color:#F5F0E8;border-left:3px solid #7BAE7F}
.toast-err{background:#2C2417;color:#F5F0E8;border-left:3px solid #C25A4A}

.spin{width:18px;height:18px;border:2px solid #D4C5A9;border-top-color:#B8962E;border-radius:50%;animation:spin 1s linear infinite}

.card{background:#F5F0E8;border:.5px solid #D4C5A9;padding:24px}
.card:hover{box-shadow:0 6px 28px rgba(44,36,23,.07)}

.pills{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:28px}
.pill{padding:9px 20px;font-size:15px;letter-spacing:.12em;text-transform:uppercase;border:.5px solid #D4C5A9;display:flex;align-items:center;gap:8px;background:#F5F0E8}
.pill-dot{width:6px;height:6px;border-radius:50%}
.pill-val{font-size:18px;font-weight:500;color:#2C2417}

.upload-zone{border:1.5px dashed #D4C5A9;background:#F5F0E8;padding:56px 40px;text-align:center;cursor:pointer;transition:all .3s;position:relative;overflow:hidden;margin-bottom:24px}
.upload-zone:hover,.upload-zone.drag{border-color:#B8962E;background:#FAF7F0;box-shadow:0 6px 32px rgba(184,150,46,.1)}
.up-icon{width:52px;height:52px;margin:0 auto 18px;border:1px solid #D4C5A9;display:flex;align-items:center;justify-content:center;transition:all .3s}
.upload-zone:hover .up-icon{border-color:#B8962E;transform:translateY(-3px)}
.up-icon svg{width:22px;height:22px;stroke:#9C8E7A;transition:stroke .3s}
.upload-zone:hover .up-icon svg{stroke:#B8962E}
.up-title{font-size:20px;font-weight:300;margin-bottom:6px}
.up-title em{font-style:italic;color:#B8962E}
.up-sub{font-size:15px;color:#9C8E7A;margin-bottom:18px}
.fmt-tags{display:flex;justify-content:center;gap:8px}
.fmt-tag{padding:3px 11px;border:.5px solid #D4C5A9;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#9C8E7A}
.camera-btn{background:#2C2417;color:#F5F0E8;border:none;padding:10px 22px;font-size:14px;cursor:pointer;letter-spacing:.05em}
.camera-btn:hover{background:#B8962E}
.file-cards{margin-bottom:16px}
.fc{background:#F5F0E8;border:.5px solid #D4C5A9;padding:14px 18px;margin-bottom:7px;display:flex;align-items:center;gap:14px;transition:all .3s;position:relative;overflow:hidden}
.fc.processing::after,.fc.uploading::after{content:'';position:absolute;bottom:0;left:0;height:2px;background:linear-gradient(90deg,#B8962E,#D4AF5A,#B8962E);background-size:200% 100%;animation:shimmer 1.5s linear infinite;width:100%}
.fc.done{border-color:rgba(123,174,127,.4)}.fc.saved{border-color:rgba(123,174,127,.6);background:#FAFFF8}.fc.error{border-color:rgba(180,60,40,.3)}
.fc-thumb{width:38px;height:44px;border:.5px solid #D4C5A9;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;letter-spacing:.08em;color:#9C8E7A;background:#EDE5D0;text-transform:uppercase}
.fc-info{flex:1;min-width:0}
.fc-name{font-size:15px;color:#2C2417;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
.fc-meta{font-size:13px;color:#9C8E7A}
.fc-st{flex-shrink:0;display:flex;align-items:center;gap:5px;font-size:13px;letter-spacing:.12em;text-transform:uppercase}
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
.rc-lbl{font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#5C4A2A;margin-bottom:6px}
.rc-inp{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;font-family:'Cormorant Garamond',serif;font-size:18px;color:#2C2417;outline:none;padding:3px 0;transition:border-color .2s}
.rc-inp:hover{border-bottom-color:#D4C5A9}.rc-inp:focus{border-bottom-color:#B8962E}.rc-inp:disabled{color:#9C8E7A}
.rc-sel{width:100%;background:transparent;border:none;border-bottom:1px solid transparent;font-family:'Cormorant Garamond',serif;font-size:18px;color:#2C2417;outline:none;padding:3px 0;-webkit-appearance:none;cursor:pointer;transition:border-color .2s}
.rc-sel:hover{border-bottom-color:#D4C5A9}.rc-sel:focus{border-bottom-color:#B8962E}.rc-sel:disabled{color:#9C8E7A;cursor:default}
.rc-act{padding:14px 18px;display:flex;gap:10px;justify-content:flex-end;border-top:.5px solid #D4C5A9}

.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:12px;letter-spacing:.15em;text-transform:uppercase}
.badge-gasto{background:rgba(180,60,40,.07);color:#8B3A2A;border:.5px solid rgba(180,60,40,.2)}
.badge-ingreso{background:rgba(91,138,94,.07);color:#3A6B3E;border:.5px solid rgba(91,138,94,.2)}
.badge-pagada{color:#3A6B3E}.badge-pendiente{color:#8B6914}
.badge-ok{background:rgba(91,138,94,.1);color:#3A6B3E;border:.5px solid rgba(91,138,94,.3)}
.e-dot{width:5px;height:5px;border-radius:50%;display:inline-block;margin-right:3px}
.dot-pagada{background:#7BAE7F}.dot-pendiente{background:#B8962E}

.fl-bar{background:#F5F0E8;border:.5px solid #D4C5A9;padding:18px 22px;margin-bottom:22px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end}
.fg{display:flex;flex-direction:column;gap:5px;min-width:130px;flex:1}
.fl{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810}
.fi,.fs{background:transparent;border:none;border-bottom:1.5px solid #9C8E7A;font-family:'Cormorant Garamond',serif;font-size:16px;color:#2C2417;outline:none;padding:5px 0;width:100%;-webkit-appearance:none;transition:border-color .2s}
.fi:focus,.fs:focus{border-bottom-color:#B8962E}
.fi::placeholder{color:#9C8E7A;font-style:italic}
.twrap{background:#F5F0E8;border:.5px solid #D4C5A9;overflow-x:auto}
table{width:100%;border-collapse:collapse;table-layout:auto}
th{padding:10px 10px;text-align:left;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#2C2417;font-weight:600;border-bottom:1.5px solid #B8962E;background:#EDE5D0;white-space:nowrap;user-select:none}
th.sort{cursor:pointer;transition:color .2s}
th.sort:hover,th.sorted{color:#8B6914}
tr.dr{border-bottom:.5px solid #D4C5A9;transition:background .2s}
tr.dr:last-child{border-bottom:none}
tr.dr:hover{background:#FAF7F0}
tr.editing{background:#FFFDF7;outline:1px solid #B8962E}
td{padding:10px 10px;font-size:14px;color:#2C2417;vertical-align:middle}
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
.importe-detail{font-size:12px;color:#9C8E7A;margin-top:2px;line-height:1.3}
.tfoot{padding:13px 18px;border-top:.5px solid #D4C5A9;display:flex;justify-content:space-between;align-items:center;background:#EDE5D0}
.tfoot-count{font-size:14px;letter-spacing:.15em;text-transform:uppercase;color:#9C8E7A}
.tfoot-tots{display:flex;gap:22px}
.tfoot-it{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.tfoot-lbl{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#9C8E7A}
.tfoot-val{font-size:18px;font-weight:500}
.empty-row{padding:56px;text-align:center;color:#9C8E7A;font-style:italic;font-size:17px}
.loading-row{padding:36px;text-align:center;display:flex;align-items:center;justify-content:center;gap:10px;color:#9C8E7A;font-style:italic}

.tabs{display:flex;background:#F5F0E8;border:.5px solid #D4C5A9;margin-bottom:0}
.tab{padding:14px 28px;background:none;border:none;font-family:'Cormorant Garamond',serif;font-size:16px;letter-spacing:.15em;text-transform:uppercase;color:#5C4A2A;cursor:pointer;transition:all .2s;border-right:.5px solid #D4C5A9}
.tab:last-child{border-right:none}
.tab.active{background:#2C2417;color:#F5F0E8}
.tab:not(.active):hover{background:#EDE5D0}
.period-tabs{display:flex;gap:8px;margin-bottom:28px}
.ptab{padding:11px 20px;background:none;border:1.5px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#2C2417;cursor:pointer;transition:all .2s}
.ptab.active{border-color:#8B6914;color:#8B6914;background:rgba(139,105,20,.06);font-weight:500}
.ptab:not(.active):hover{border-color:#2C2417}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:26px}
.kpi{background:#F5F0E8;border:.5px solid #D4C5A9;padding:22px;position:relative;overflow:hidden;transition:all .3s}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--ac);opacity:.65}
.kpi:hover{box-shadow:0 6px 28px rgba(44,36,23,.08);transform:translateY(-1px)}
.kpi-lbl{font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810;margin-bottom:10px}
.kpi-val{font-size:36px;font-weight:300;letter-spacing:-.02em;color:var(--cl);margin-bottom:6px}
.kpi-sub{font-size:16px;color:#2C2417;font-style:italic;line-height:1.6;white-space:pre-line}
.kpi-delta{font-size:16px;margin-top:8px;display:flex;align-items:center;gap:5px;font-weight:500}
.dpos{color:#2E6B32}.dneg{color:#8B3A2A}
.ch-card{background:#F5F0E8;border:.5px solid #D4C5A9;padding:26px;transition:box-shadow .3s}
.ch-card:hover{box-shadow:0 6px 28px rgba(44,36,23,.06)}
.ch-title{font-size:14px;letter-spacing:.22em;text-transform:uppercase;color:#3A2810;margin-bottom:4px}
.ch-sub{font-size:17px;color:#2C2417;margin-bottom:22px;font-style:italic}
.ch-subtabs{display:flex;gap:0;margin-bottom:18px;border-bottom:.5px solid #D4C5A9}
.ch-stab{padding:8px 18px;background:none;border:none;border-bottom:2px solid transparent;font-family:'Cormorant Garamond',serif;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s;margin-bottom:-.5px}
.ch-stab.active{color:#2C2417;border-bottom-color:#B8962E}
.charts-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}
.full{grid-column:1/-1}
.pend-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:.5px solid #D4C5A9}
.pend-row:last-child{border-bottom:none}
.pend-n{font-size:16px;font-weight:500;color:#2C2417}
.pend-d{font-size:14px;color:#5C4A2A;margin-top:2px}
.pend-amt{font-size:18px;font-weight:500}
.prov-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:.5px solid #D4C5A9}
.prov-row:last-child{border-bottom:none}
.prov-rank{font-size:11px;color:#D4C5A9;width:20px;text-align:center}
.prov-bw{flex:1;display:flex;flex-direction:column;gap:3px}
.prov-nm{font-size:15px;color:#2C2417}
.prov-bar{height:3px;background:#D4C5A9;border-radius:2px;overflow:hidden}
.prov-fill{height:100%;background:#B8962E;border-radius:2px;transition:width .8s ease}
.prov-tot{font-size:15px;font-weight:500;color:#2C2417;white-space:nowrap}
.iva-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.iva-c{padding:14px;border:.5px solid #D4C5A9;text-align:center}
.iva-lbl{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810;margin-bottom:6px}
.iva-val{font-size:23px;font-weight:300;color:#B8962E}
.iva-s{font-size:14px;color:#3A2810;margin-top:3px}
.trim-table{width:100%;border-collapse:collapse;font-family:'Cormorant Garamond',serif}
.trim-table th{padding:10px 14px;text-align:right;font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:#3A2810;font-weight:400;border-bottom:.5px solid #D4C5A9}
.trim-table th:first-child{text-align:left}
.trim-table td{padding:12px 14px;text-align:right;font-size:16px;color:#2C2417;border-bottom:.5px solid #D4C5A9}
.trim-table td:first-child{text-align:left;font-weight:500;color:#8B6914}
.trim-table tr:last-child td{border-bottom:none}
.ctooltip{background:#2C2417;padding:9px 13px;border:none}
.ctt-lbl{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#D4C5A9;margin-bottom:5px}
.ctt-row{display:flex;align-items:center;gap:7px;font-size:13px;color:#F5F0E8}
.ctt-dot{width:6px;height:6px;border-radius:50%}

.exp-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:18px 22px;background:#F5F0E8;border:.5px solid #D4C5A9;margin-bottom:24px}
.exp-lbl{font-size:14px;letter-spacing:.22em;text-transform:uppercase;color:#5C4A2A;margin-right:4px}
.scope-btn{padding:10px 20px;background:none;border:1px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#5C4A2A;cursor:pointer;transition:all .2s}
.scope-btn.active{background:#2C2417;color:#F5F0E8;border-color:#2C2417}
.scope-btn:not(.active):hover{border-color:#2C2417;color:#2C2417}
.trim-sel{padding:9px 14px;background:#EDE5D0;border:1px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:13px;color:#2C2417;outline:none;cursor:pointer;-webkit-appearance:none;transition:border-color .2s}
.trim-sel:focus{border-color:#B8962E}
.prev-tabs{display:flex;gap:0;border-bottom:.5px solid #D4C5A9;margin-bottom:18px}
.prev-tab{padding:9px 22px;background:none;border:none;border-bottom:2px solid transparent;font-family:'Cormorant Garamond',serif;font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#9C8E7A;cursor:pointer;transition:all .2s;margin-bottom:-.5px}
.prev-tab.active{color:#2C2417;border-bottom-color:#B8962E}
.sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:22px}
.sum-c{padding:14px;border:.5px solid #D4C5A9;background:#EDE5D0}
.sum-lbl{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#3A2810;margin-bottom:6px}
.sum-val{font-size:21px;font-weight:300}
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
.mf-lbl{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#9C8E7A;margin-bottom:3px}
.mf-val{font-size:16px;color:#2C2417}
.modal-ft{padding:14px 26px;border-top:.5px solid #D4C5A9;display:flex;gap:9px;justify-content:flex-end;background:#EDE5D0}
.tipo-short{display:none;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700}
.estado-dot{display:none;width:10px;height:10px;border-radius:50%;flex-shrink:0}
.acts-mob{display:none;position:relative}
.acts-drop{position:absolute;right:0;top:calc(100% + 4px);background:#F5F0E8;border:.5px solid #D4C5A9;z-index:100;min-width:120px;box-shadow:0 4px 16px rgba(0,0,0,.12)}
.acts-drop button{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;background:none;border:none;border-bottom:.5px solid #D4C5A9;font-family:'Cormorant Garamond',serif;font-size:14px;color:#2C2417;cursor:pointer;text-align:left}
.acts-drop button:last-child{border-bottom:none}
.acts-drop button:hover{background:#EDE5D0}
.acts-drop button svg{width:14px;height:14px;flex-shrink:0}
.acts-drop .del-opt{color:#8B3A2A}

@media(max-width:900px){
  .sidebar{width:56px}.sb-name,.sb-sub,.sb-item span{display:none}
  .sb-item{padding:14px;justify-content:center}.sb-logo{padding:16px;align-items:center;display:flex}
  .sb-mono{margin:0}.sb-footer{display:none}
  .view{padding:20px 14px}
  .charts-grid{grid-template-columns:1fr}.full{grid-column:1}
  .modal-body{flex-direction:column}.modal-data{width:100%}
  .iva-grid{grid-template-columns:1fr 1fr}
  .kpi-grid{grid-template-columns:1fr 1fr}
  .rc-grid{grid-template-columns:1fr 1fr!important}
  .fl-bar{flex-direction:column;gap:10px}
  .fg{min-width:unset!important;width:100%}
  .pills{gap:6px}
  .pill{padding:6px 12px;font-size:13px}
  .view-title{font-size:28px}
  .page-header{flex-direction:column;align-items:flex-start;gap:12px}
  .tabs{flex-wrap:wrap}
  .tab{padding:10px 16px;font-size:14px}
  .period-tabs{flex-wrap:wrap;gap:6px}
  .exp-bar{flex-direction:column;align-items:flex-start}
  .sum-grid{grid-template-columns:1fr 1fr}
  .ch-subtabs{flex-wrap:wrap}
  .charts-grid .ch-card{padding:18px 14px}
  .col-hide-mobile{display:none}
  .importe-detail{display:none}
  th,td{padding:8px 8px;font-size:13px}
}
@media(max-width:480px){
  .sidebar{display:none}
  .main{width:100vw;padding-bottom:64px}
  .view{padding:16px 12px}
  .kpi-grid{grid-template-columns:1fr}
  .iva-grid{grid-template-columns:1fr 1fr}
  table{width:100%}
  .twrap{-webkit-overflow-scrolling:touch}
  .btn-ink span{display:none}
  .btn-ink svg{margin:0}
  .col-hide-mobile{display:none}
  .chk-col{display:none}
  .tipo-full{display:none}
  .tipo-short{display:flex}
  .estado-full{display:none}
  .estado-dot{display:inline-block}
  .acts-desk{display:none}
  .acts-mob{display:block}
  .mob-nav{display:flex;position:fixed;bottom:0;left:0;right:0;height:58px;background:#2C2417;border-top:.5px solid rgba(255,255,255,.12);z-index:200}
  .mob-nav-it{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#9C8E7A;cursor:pointer;font-size:9px;letter-spacing:.08em;text-transform:uppercase;transition:color .2s;border:none;background:none;padding:0}
  .mob-nav-it.active{color:#B8962E}
  .mob-nav-it svg{width:20px;height:20px}
}
.mob-nav{display:none}
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
// Comprime una imagen a máx 1600px y calidad 0.82 para no superar límites del serverless
function compressImage(file, maxPx = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob || file), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

async function extractWithAI(file) {
  const isPdf = file.type==="application/pdf";
  // Comprimir imágenes para no superar el límite de body del serverless (~4MB)
  const fileToSend = isPdf ? file : await compressImage(file);
  const b64 = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(fileToSend);});
  const mediaType = "image/jpeg";
  const block = isPdf
    ? {type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}}
    : {type:"image",source:{type:"base64",media_type:mediaType,data:b64}};
  const prompt = `Analiza esta factura. Responde SOLO con JSON válido sin texto extra ni backticks:
{"tipo":"gasto","fecha":"DD/MM/YYYY","numero_factura":"","proveedor_cliente":"","nif_cif":"","concepto":"","base_imponible":0,"iva_porcentaje":21,"iva_importe":0,"total":0,"categoria":"Otros","estado":"pendiente"}
tipo: gasto|ingreso. categoria: Telas y materiales|Transporte y envíos|Marketing y publicidad|Equipamiento y maquinaria|Servicios externos|Nóminas|Alquiler|Suministros|Otros. estado: pagada|pendiente.`;

  const endpoint = typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api/ai-extract"
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
  const parsed = JSON.parse(clean);

  // Auto-calcular IVA si es ingreso y no viene desglosado
  if (parsed.tipo === "ingreso" && parsed.total > 0 && (!parsed.iva_importe || Number(parsed.iva_importe) === 0)) {
    const total = Number(parsed.total);
    const ivaPct = Number(parsed.iva_porcentaje) || 21;
    const base = Math.round((total / (1 + ivaPct/100)) * 100) / 100;
    const iva  = Math.round((total - base) * 100) / 100;
    parsed.base_imponible = base;
    parsed.iva_importe    = iva;
  }
  return parsed;
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
    const bal=tI-tG,ivaR=ing.reduce((a,f)=>a+calcIva(f),0),ivaS=gas.reduce((a,f)=>a+calcIva(f),0);
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
  const gastosSinEspeciales = facturas.filter(f=>f.tipo==="gasto"&&f.categoria!=="Nóminas"&&f.categoria!=="Alquiler");
  XLSX.utils.book_append_sheet(wb,build(gastosSinEspeciales,"Gastos (facturas)"),"Gastos");
  const nominas = facturas.filter(f=>f.categoria==="Nóminas");
  if(nominas.length>0) XLSX.utils.book_append_sheet(wb,build(nominas,"Nóminas"),"Nóminas");
  const alquiler = facturas.filter(f=>f.categoria==="Alquiler");
  if(alquiler.length>0) XLSX.utils.book_append_sheet(wb,build(alquiler,"Alquiler"),"Alquiler");
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
// ── Recorte de foto para móvil ────────────────────────────────
function CropModal({ file, onConfirm, onCancel }) {
  const imgRef = useRef();
  const containerRef = useRef();
  const [imgSrc] = useState(()=>URL.createObjectURL(file));
  const [rect, setRect] = useState({x:0.05,y:0.05,w:0.9,h:0.9});
  const [nat, setNat] = useState({w:1,h:1});
  const dragState = useRef(null);

  useEffect(()=>()=>URL.revokeObjectURL(imgSrc),[imgSrc]);

  const onLoad = (e) => {
    const img=e.target;
    setNat({w:img.naturalWidth,h:img.naturalHeight});
    // Auto-detectar bordes del documento
    try {
      const cw=200, ch=Math.round(200*img.naturalHeight/img.naturalWidth);
      const c=document.createElement("canvas"); c.width=cw; c.height=ch;
      const ctx=c.getContext("2d"); ctx.drawImage(img,0,0,cw,ch);
      const d=ctx.getImageData(0,0,cw,ch).data;
      const bg=[d[0],d[1],d[2]]; const thr=45;
      let x1=cw,y1=ch,x2=0,y2=0;
      for(let y=0;y<ch;y++) for(let x=0;x<cw;x++){
        const i=(y*cw+x)*4;
        if(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2])>thr){
          x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);
        }
      }
      const p=0.015;
      if(x2>x1+cw*0.1&&y2>y1+ch*0.1) setRect({
        x:Math.max(0,x1/cw-p),y:Math.max(0,y1/ch-p),
        w:Math.min(1,(x2-x1)/cw+p*2),h:Math.min(1,(y2-y1)/ch+p*2),
      });
    } catch(e){}
  };

  const getPos=(e,el)=>{
    const b=el.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    return {x:(cx-b.left)/b.width,y:(cy-b.top)/b.height};
  };

  const startDrag=(type,e)=>{
    e.stopPropagation(); e.preventDefault();
    dragState.current={type,startRect:{...rect},startPos:getPos(e,containerRef.current)};
  };

  const onMove=(e)=>{
    if(!dragState.current) return; e.preventDefault();
    const {type,startRect,startPos}=dragState.current;
    const pos=getPos(e,containerRef.current);
    const dx=pos.x-startPos.x, dy=pos.y-startPos.y;
    let {x,y,w,h}=startRect;
    if(type==="body"){x=Math.max(0,Math.min(1-w,x+dx));y=Math.max(0,Math.min(1-h,y+dy));}
    else{
      if(type[0]==="t"){y=y+dy;h=h-dy;}
      if(type[0]==="b"){h=h+dy;}
      if(type[1]==="l"){x=x+dx;w=w-dx;}
      if(type[1]==="r"){w=w+dx;}
      if(w<0.05){if(type[1]==="l")x=startRect.x+startRect.w-0.05;w=0.05;}
      if(h<0.05){if(type[0]==="t")y=startRect.y+startRect.h-0.05;h=0.05;}
      x=Math.max(0,x);y=Math.max(0,y);
      if(x+w>1)w=1-x; if(y+h>1)h=1-y;
    }
    setRect({x,y,w,h});
  };

  const confirm=()=>{
    const c=document.createElement("canvas");
    c.width=Math.round(rect.w*nat.w); c.height=Math.round(rect.h*nat.h);
    c.getContext("2d").drawImage(imgRef.current,Math.round(rect.x*nat.w),Math.round(rect.y*nat.h),c.width,c.height,0,0,c.width,c.height);
    c.toBlob(b=>onConfirm(new File([b],file.name.replace(/\.[^.]+$/,".jpg"),{type:"image/jpeg"})),"image/jpeg",0.92);
  };

  const H=[{id:"tl",s:{top:0,left:0,cursor:"nwse-resize"}},{id:"tr",s:{top:0,right:0,cursor:"nesw-resize"}},{id:"bl",s:{bottom:0,left:0,cursor:"nesw-resize"}},{id:"br",s:{bottom:0,right:0,cursor:"nwse-resize"}}];

  return (
    <div className="overlay" style={{zIndex:999}} onClick={onCancel}>
      <div className="modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
        <div className="modal-hd">
          <div><div className="modal-ttl">Recortar factura</div><div className="modal-meta">Arrastra las esquinas para ajustar — se auto-detectaron los bordes</div></div>
          <button className="modal-x" onClick={onCancel}>{I.x}</button>
        </div>
        <div ref={containerRef} style={{padding:"12px 16px",overflow:"auto",maxHeight:"62vh",touchAction:"none",userSelect:"none"}}
          onMouseMove={onMove} onMouseUp={()=>{dragState.current=null;}} onMouseLeave={()=>{dragState.current=null;}}
          onTouchMove={onMove} onTouchEnd={()=>{dragState.current=null;}}>
          <div style={{position:"relative",display:"inline-block",width:"100%"}}>
            <img ref={imgRef} src={imgSrc} onLoad={onLoad} style={{width:"100%",height:"auto",display:"block"}} alt=""/>
            {/* Sombras fuera del área de recorte */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:rect.y*100+"%",background:"rgba(0,0,0,.55)",pointerEvents:"none"}}/>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:(1-rect.y-rect.h)*100+"%",background:"rgba(0,0,0,.55)",pointerEvents:"none"}}/>
            <div style={{position:"absolute",top:rect.y*100+"%",left:0,width:rect.x*100+"%",height:rect.h*100+"%",background:"rgba(0,0,0,.55)",pointerEvents:"none"}}/>
            <div style={{position:"absolute",top:rect.y*100+"%",right:0,width:(1-rect.x-rect.w)*100+"%",height:rect.h*100+"%",background:"rgba(0,0,0,.55)",pointerEvents:"none"}}/>
            {/* Marco de recorte */}
            <div style={{position:"absolute",left:rect.x*100+"%",top:rect.y*100+"%",width:rect.w*100+"%",height:rect.h*100+"%",border:"2px solid #B8962E",boxSizing:"border-box",cursor:"move"}}
              onMouseDown={e=>startDrag("body",e)} onTouchStart={e=>startDrag("body",e)}>
              {H.map(h=><div key={h.id} style={{position:"absolute",width:22,height:22,background:"#B8962E",...h.s}} onMouseDown={e=>startDrag(h.id,e)} onTouchStart={e=>startDrag(h.id,e)}/>)}
            </div>
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn-sm" onClick={onCancel}>Cancelar</button>
          <button className="btn-ink" onClick={confirm}><span>Recortar y usar</span></button>
        </div>
      </div>
    </div>
  );
}

function ViewSubida({ onSaved, toast }) {
  const [files,   setFiles]   = useState([]);
  const [drag,    setDrag]    = useState(false);
  const [results, setResults] = useState({});
  const [saved,   setSaved]   = useState({});
  const inputRef = useRef();
  const cameraRef = useRef();
  const [cropTarget, setCropTarget] = useState(null);

  const addFiles = useCallback((nf) => {
    const arr = Array.from(nf).filter(f=>f.type.match(/pdf|jpeg|jpg|png|heic|heif/i)||f.name.match(/\.(pdf|jpg|jpeg|png|heic|heif)$/i)||f.type.startsWith("image/"));
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

      // Comprobar duplicado
      let esDuplicada = false;
      if (data.numero_factura) {
        const {data:existing} = await supa.from("facturas").select("id")
          .eq("numero_factura", data.numero_factura).limit(1);
        if (existing && existing.length > 0) {
          esDuplicada = true;
          setResults(p=>({...p,[item.id]:{...p[item.id],_duplicado:true}}));
          toast(`⚠️ Posible duplicado: ${data.numero_factura}`,"err");
        }
      } else if (data.tipo==="ingreso" && data.proveedor_cliente && data.total) {
        // Para ingresos sin número de factura, comprobar por cliente + importe
        const {data:existing} = await supa.from("facturas").select("id")
          .eq("tipo","ingreso")
          .eq("proveedor_cliente", data.proveedor_cliente)
          .eq("total", Number(data.total)).limit(1);
        if (existing && existing.length > 0) {
          esDuplicada = true;
          setResults(p=>({...p,[item.id]:{...p[item.id],_duplicado:true}}));
          toast(`⚠️ Posible ingreso duplicado: ${data.proveedor_cliente} — ${fmt(data.total)}`,"err");
        }
      }

      const mimeType = item.file.type || (item.file.name.match(/\.pdf$/i) ? "application/pdf" : "image/jpeg");
      const tipo = mimeType.startsWith("image")?"image":"pdf";

      const fecha = data.fecha || "";
      const mes   = parseInt(fecha.split("/")[1]) || new Date().getMonth()+1;
      const anyo  = fecha.split("/")[2] || new Date().getFullYear().toString();
      const trimestre = mes<=3?"T1":mes<=6?"T2":mes<=9?"T3":"T4";

      // Subir a Drive (fuente principal del archivo)
      let driveUrl = null;
      try {
        const driveResult = await subirADrive(item.file, trimestre, anyo, data.tipo);
        driveUrl = typeof driveResult === "string" ? driveResult : null;
      } catch(driveErr) {
        toast("⚠️ Error subiendo a Drive: " + driveErr.message, "err");
      }

      const {error:dbErr} = await supa.from("facturas").insert([{
        ...data,
        base_imponible: Number(data.base_imponible)||0,
        iva_porcentaje: Number(data.iva_porcentaje)||21,
        iva_importe:    Number(data.iva_importe)||0,
        total:          Number(data.total)||0,
        archivo_nombre: item.file.name,
        archivo_url:    driveUrl,
        archivo_tipo:   tipo,
        drive_url:      driveUrl,
        es_duplicada:   esDuplicada,
      }]);
      if(dbErr) throw dbErr;

      setSaved(p=>({...p,[item.id]:true}));
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"done"}:f));

      if(driveUrl) toast(`Guardado en Drive (${trimestre} ${anyo}) ✓`);
      else toast("Guardado ✓");

      onSaved();
    } catch(e) {
      setFiles(p=>p.map(f=>f.id===item.id?{...f,status:"error"}:f));
      toast("Error: "+e.message,"err");
    }
  };

  const wc = files.filter(f=>f.status==="waiting"||f.status==="error").length;

  const [modoManual, setModoManual] = useState(false);
  const [manual, setManual] = useState({tipo:"gasto",fecha:"",numero_factura:"",proveedor_cliente:"",nif_cif:"",concepto:"",base_imponible:"",iva_porcentaje:"21",iva_importe:"",total:"",categoria:"Telas y materiales",estado:"pagada"});
  const [savingManual, setSavingManual] = useState(false);

  const updManual = (k,v) => setManual(p => {
    const next = {...p, [k]:v};
    if((k==="base_imponible"||k==="iva_porcentaje") && next.base_imponible) {
      const base = parseFloat(next.base_imponible)||0;
      const pct  = parseFloat(next.iva_porcentaje)||21;
      const iva  = Math.round(base*pct/100*100)/100;
      next.iva_importe = String(iva);
      next.total = String(Math.round((base+iva)*100)/100);
    }
    return next;
  });

  const saveManual = async () => {
    if(!manual.proveedor_cliente || !manual.fecha) { toast("Completa al menos fecha y proveedor","err"); return; }
    setSavingManual(true);
    try {
      const supa = await db();
      const {error} = await supa.from("facturas").insert([{
        tipo: manual.tipo, fecha: manual.fecha, numero_factura: manual.numero_factura,
        proveedor_cliente: manual.proveedor_cliente, nif_cif: manual.nif_cif, concepto: manual.concepto,
        base_imponible: parseFloat(manual.base_imponible)||0, iva_porcentaje: parseFloat(manual.iva_porcentaje)||21,
        iva_importe: parseFloat(manual.iva_importe)||0, total: parseFloat(manual.total)||0,
        categoria: manual.categoria, estado: manual.estado,
        archivo_nombre: null, archivo_url: null, archivo_tipo: null, drive_url: null, es_duplicada: false,
      }]);
      if(error) throw error;
      toast("Entrada guardada ✓");
      setManual({tipo:"gasto",fecha:"",numero_factura:"",proveedor_cliente:"",nif_cif:"",concepto:"",base_imponible:"",iva_porcentaje:"21",iva_importe:"",total:"",categoria:"Telas y materiales",estado:"pagada"});
      onSaved();
    } catch(e) { toast("Error: "+e.message,"err"); }
    setSavingManual(false);
  };

  return (
    <div className="view">
      <div className="eyebrow">Módulo 2</div>
      <h1 className="view-title">Subir <em>facturas</em></h1>

      {/* Toggle modo */}
      <div style={{display:"flex",gap:0,marginBottom:28,borderBottom:"1.5px solid #D4C5A9"}}>
        {[["archivo","Subir archivo (IA)"],["manual","Entrada manual"]].map(([k,l])=>(
          <button key={k} onClick={()=>setModoManual(k==="manual")} style={{padding:"11px 24px",background:"none",border:"none",borderBottom:modoManual===(k==="manual")?"2.5px solid #B8962E":"2.5px solid transparent",fontFamily:"'Cormorant Garamond',serif",fontSize:16,letterSpacing:".1em",textTransform:"uppercase",color:modoManual===(k==="manual")?"#2C2417":"#9C8E7A",cursor:"pointer",marginBottom:-1.5,transition:"all .2s"}}>{l}</button>
        ))}
      </div>

      {/* Formulario manual */}
      {modoManual&&(
        <div style={{background:"#F5F0E8",border:".5px solid #D4C5A9",marginBottom:32}}>
          <div style={{padding:"14px 20px",background:"#EDE5D0",borderBottom:".5px solid #D4C5A9",fontSize:13,letterSpacing:".18em",textTransform:"uppercase",color:"#2C2417"}}>Nueva entrada manual</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))"}}>
            {[["Fecha","fecha","date"],["Nº factura / ref.","numero_factura","text"],["Proveedor / Cliente","proveedor_cliente","text"],["NIF / CIF","nif_cif","text"],["Concepto","concepto","text"],["Base imponible","base_imponible","number"],["IVA %","iva_porcentaje","number"],["IVA importe","iva_importe","number"],["Total","total","number"]].map(([lbl,fld,tp])=>(
              <div key={fld} className="rc-f">
                <div className="rc-lbl">{lbl}</div>
                <input className="rc-inp" type={tp} value={manual[fld]} onChange={e=>updManual(fld,e.target.value)} placeholder={tp==="number"?"0.00":""}/>
              </div>
            ))}
            <div className="rc-f"><div className="rc-lbl">Tipo</div><select className="rc-sel" value={manual.tipo} onChange={e=>updManual("tipo",e.target.value)}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select></div>
            <div className="rc-f"><div className="rc-lbl">Categoría</div><select className="rc-sel" value={manual.categoria} onChange={e=>updManual("categoria",e.target.value)}>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
            <div className="rc-f"><div className="rc-lbl">Estado</div><select className="rc-sel" value={manual.estado} onChange={e=>updManual("estado",e.target.value)}><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option></select></div>
          </div>
          <div style={{padding:"14px 20px",display:"flex",justifyContent:"flex-end",gap:10,borderTop:".5px solid #D4C5A9"}}>
            <button className="btn-sm" onClick={()=>setManual({tipo:"gasto",fecha:"",numero_factura:"",proveedor_cliente:"",nif_cif:"",concepto:"",base_imponible:"",iva_porcentaje:"21",iva_importe:"",total:"",categoria:"Telas y materiales",estado:"pagada"})}>Limpiar</button>
            <button className="btn-ink" onClick={saveManual} disabled={savingManual}><span>{savingManual?"Guardando...":"Guardar entrada"}</span></button>
          </div>
        </div>
      )}

      {/* Modo archivo */}
      {!modoManual&&<>
      <div className={"upload-zone"+(drag?" drag":"")} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>inputRef.current.click()}>
        <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,image/*" style={{display:"none"}} onChange={e=>{addFiles(e.target.files);e.target.value="";}}/>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{if(e.target.files[0])setCropTarget(e.target.files[0]);e.target.value="";}}/>
        <div className="up-icon">{I.upload}</div>
        <p className="up-title">Arrastra tus facturas aquí o <em>haz clic para seleccionar</em></p>
        <p className="up-sub">PDF, foto o imagen escaneada — varias a la vez</p>
        <div className="fmt-tags">{["PDF","JPG","PNG"].map(f=><span key={f} className="fmt-tag">{f}</span>)}</div>
        <button className="btn-sm camera-btn" style={{marginTop:14}} onClick={e=>{e.stopPropagation();cameraRef.current.click();}}>📷 Tomar foto</button>
      </div>
      {cropTarget&&<CropModal file={cropTarget} onConfirm={f=>{addFiles([f]);setCropTarget(null);}} onCancel={()=>setCropTarget(null)}/>}

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
          <div style={{fontSize:11,letterSpacing:".22em",textTransform:"uppercase",color:"#9C8E7A",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>Revisa y guarda<span style={{flex:1,height:".5px",background:"#D4C5A9",display:"block"}}/></div>
          {files.filter(f=>results[f.id]).map(item=>{
            const r=results[item.id],isSaved=saved[item.id];
            return (
              <div key={item.id} className={"result-card"+(isSaved?" saved-c":"")}>
                <div className="rc-hd">
                  <span className="rc-name">{item.file.name}</span>
                  <div style={{display:"flex",gap:7}}>
                    {isSaved&&<span className="badge badge-ok">✓ Guardado</span>}
                    {r._duplicado&&<span className="badge" style={{background:"rgba(180,30,20,.12)",color:"#8B1A0A",border:".5px solid rgba(180,30,20,.5)",fontSize:13,fontWeight:600,padding:"4px 12px"}}>⚠ DUPLICADA</span>}
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
                    <button className="btn-sm" style={{background:"#2C2417",color:"#F5F0E8",borderColor:"#2C2417"}} onClick={()=>saveFactura(item)} disabled={["processing","uploading"].includes(item.status)}>
                      {["processing","uploading"].includes(item.status)?"Guardando...":"Guardar"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VISTA: LISTADO
// ═══════════════════════════════════════════════════════════
function ViewListado({ facturas, historico, setHistorico, guardarHistorico, cargandoHist, loading, onRefresh, toast }) {
  const [editingId,setEditingId] = useState(null);
  const [editData, setEditData]  = useState({});
  const [editingFechaReal, setEditingFechaReal] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(null);
  const [sortField,setSortField] = useState("creado_en");
  const [sortDir,  setSortDir]   = useState("desc");
  const [visor,    setVisor]     = useState(null);
  const [exporting,setExporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const toggleSelect = (id) => setSelected(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
  const selectAll = () => setSelected(filtered.length===selected.size ? new Set() : new Set(filtered.map(f=>f.id)));
  const [filters,  setFilters]   = useState({busqueda:"",tipo:"",categorias:[],estado:"",fechaDesde:"",fechaHasta:""});
  const [vistaTab, setVistaTab]  = useState("todas");
  const _hoy = new Date();
  const _anyoActual = _hoy.getFullYear().toString();
  const _mesActual = _hoy.getMonth()+1;
  const _trimActual = _mesActual<=3?"T1":_mesActual<=6?"T2":_mesActual<=9?"T3":"T4";
  const [filtroAnyo,  setFiltroAnyo]  = useState(_anyoActual);
  const [filtroTrim,  setFiltroTrim]  = useState(_trimActual);
  const [importando,  setImportando]  = useState(false);
  const xlsxRef = useRef();

  // Años disponibles en histórico
  const anyosDisponibles = useMemo(()=>{
    const set = new Set();
    set.add(_anyoActual);
    historico.forEach(f=>{ if(f._anyo) set.add(f._anyo); });
    return [...set].sort((a,b)=>b-a);
  },[historico,_anyoActual]);

  // Parsear Excel histórico — compatible con formato Atelier La Nonna
  const importarExcel = async(e) => {
    const file = e.target.files[0];
    if(!file) return;
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:"array", cellDates:true, raw:false});
      const nuevas = [];

      const parseFecha = (v) => {
        if(!v) return "";
        if(v instanceof Date) {
          const d = String(v.getDate()).padStart(2,"0");
          const m = String(v.getMonth()+1).padStart(2,"0");
          const y = v.getFullYear();
          return `${d}/${m}/${y}`;
        }
        const s = String(v).trim();
        // Intentar parsear fechas en formato "DD/MM/YYYY" o similar
        const match = s.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if(match) return `${match[1].padStart(2,"0")}/${match[2].padStart(2,"0")}/${match[3].length===2?"20"+match[3]:match[3]}`;
        return s;
      };

      const parseNum = (v) => {
        if(v===null||v===undefined||v==="") return 0;
        if(typeof v==="number") return Math.round(v*100)/100;
        const s = String(v).replace(/[^\d.,\-]/g,"").replace(",",".");
        return Math.round((parseFloat(s)||0)*100)/100;
      };

      const getAnyo = (f) => { const m=f.match(/\d{4}/); return m?m[0]:new Date().getFullYear().toString(); };
      const getMes  = (f) => { const m=f.match(/\d{1,2}\/(\d{1,2})\//); return m?parseInt(m[1]):0; };
      const getTrim = (m) => m<=3?"T1":m<=6?"T2":m<=9?"T3":"T4";

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        if(!ws || !ws["!ref"]) return;
        const sheetLower = sheetName.toLowerCase().replace(/\./g,"").trim();
        const tipoHoja = sheetLower.includes("ingreso") ? "ingreso" : "gasto";

        // Obtener todas las filas como arrays
        const allRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false, dateNF:"DD/MM/YYYY"});

        // Buscar fila de cabecera: primera que tenga al menos 3 celdas con texto
        // y que contenga palabras clave de cabecera
        let headerRowIdx = -1;
        let colFecha=-1, colProveedor=-1, colNfactura=-1, colTotal=-1, colIva=-1, colBase=-1;

        for(let i=0; i<Math.min(allRows.length,25); i++) {
          const row = allRows[i];
          if(!row) continue;
          const textCells = row.filter(c=>c&&typeof c==="string"&&c.trim().length>2);
          if(textCells.length < 2) continue;
          const rowStr = row.map(c=>c?String(c).toLowerCase():"").join("|");
          const isHeader = (rowStr.includes("fecha")&&(rowStr.includes("importe")||rowStr.includes("emisor")||rowStr.includes("proveedor")||rowStr.includes("nº")||rowStr.includes("numero")));
          if(isHeader) {
            headerRowIdx = i;
            row.forEach((cell, ci) => {
              if(!cell) return;
              const c = String(cell).toLowerCase().trim();
              if((c.includes("fecha factura")||c==="fecha")&&colFecha===-1) colFecha=ci;
              if((c.includes("emisora")||c.includes("proveedor")||c.includes("destinat")||c.includes("pedido")||c.includes("cliente"))&&colProveedor===-1) colProveedor=ci;
              if((c.includes("número factura")||c.includes("nº factura")||c.includes("número")||c.includes("nº")||c.includes("factura"))&&colNfactura===-1) colNfactura=ci;
              if((c.includes("importe total")||c.includes("importe iva")||(c.includes("importe")&&!c.includes("neto")))&&colTotal===-1) colTotal=ci;
              if(c==="iva"&&colIva===-1) colIva=ci;
              if((c.includes("neto")||c.includes("base"))&&colBase===-1) colBase=ci;
            });
            break;
          }
        }

        if(headerRowIdx===-1) {
          console.warn("No se encontró cabecera en hoja:", sheetName);
          return;
        }

        // Leer datos desde la fila siguiente a la cabecera
        for(let i=headerRowIdx+1; i<allRows.length; i++) {
          const row = allRows[i];
          if(!row) continue;

          const totalVal = parseNum(colTotal>=0 ? row[colTotal] : null);
          if(totalVal===0) continue;

          const fechaRaw = colFecha>=0 ? row[colFecha] : null;
          if(!fechaRaw) continue;
          const fechaStr = parseFecha(fechaRaw);
          const anyo = getAnyo(fechaStr);
          if(!anyo||anyo==="NaN"||parseInt(anyo)<2020) continue;

          const mes = getMes(fechaStr);
          const ivaVal  = parseNum(colIva>=0 ? row[colIva] : null);
          const baseVal = colBase>=0 ? parseNum(row[colBase]) : 0;
          const baseCalc = baseVal || (totalVal>0&&ivaVal>0 ? Math.round((totalVal-ivaVal)*100)/100 : Math.round(totalVal/1.21*100)/100);
          const ivaCalc  = ivaVal  || Math.round((totalVal-baseCalc)*100)/100;

          const provStr = colProveedor>=0 && row[colProveedor] ? String(row[colProveedor]).trim() : "";
          const nfact   = colNfactura>=0 && row[colNfactura]  ? String(row[colNfactura]).trim()  : "";

          nuevas.push({
            id: "hist_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6),
            _historico: true,
            _anyo: anyo,
            _origen: file.name,
            tipo: tipoHoja,
            fecha: fechaStr,
            numero_factura: nfact,
            proveedor_cliente: provStr || (tipoHoja==="ingreso"?"Cliente":"Proveedor"),
            nif_cif: "",
            concepto: "",
            base_imponible: baseCalc,
            iva_porcentaje: 21,
            iva_importe: ivaCalc,
            total: totalVal,
            categoria: tipoHoja==="ingreso" ? "Servicios externos" : "Otros",
            estado: "pagada",
            trimestre: getTrim(mes),
            archivo_nombre: file.name,
            archivo_url: null,
            archivo_tipo: "excel",
          });
        }
      });

      if(nuevas.length===0) {
        toast("No se encontraron datos. Verifica que el Excel tiene hojas GASTOS/INGRESOS con cabeceras en las primeras 25 filas.","err");
        setImportando(false);
        e.target.value="";
        return;
      }

      const merged = [...historico.filter(f=>f._origen!==file.name),...nuevas];
      setHistorico(merged);
      await guardarHistorico(merged);
      toast(`Importadas ${nuevas.length} filas de ${file.name} ✓`);
    } catch(err) {
      toast("Error al leer el Excel: "+err.message,"err");
    }
    setImportando(false);
    e.target.value="";
  };



  const setF = (k,v)=>setFilters(p=>({...p,[k]:v}));
  const resetF = ()=>setFilters({busqueda:"",tipo:"",categorias:[],estado:"",fechaDesde:"",fechaHasta:""});
  const toggleCat = (cat) => setFilters(p=>({...p, categorias: p.categorias.includes(cat)?p.categorias.filter(c=>c!==cat):[...p.categorias,cat]}));
  const pD = (s)=>{const[d,m,y]=(s||"").split("/");return new Date(`${y}-${m}-${d}`);};

  const filtered = useMemo(()=>{
    // Merge Supabase + histórico con filtro año/trimestre
    const supaFiltradas = facturas.filter(f=>!f.eliminado_en).map(f=>{
      const mes = parseInt((f.fecha||"").split("/")[1])||0;
      const anyo = (f.fecha||"").split("/")[2]||"";
      const trim = mes<=3?"T1":mes<=6?"T2":mes<=9?"T3":"T4";
      return {...f, _anyo: anyo, trimestre: trim};
    });
    let arr = [...supaFiltradas, ...historico];
    // Filtro por año
    if(filtroAnyo) arr=arr.filter(f=>f._anyo===filtroAnyo);
    // Filtro por trimestre
    if(filtroTrim) arr=arr.filter(f=>f.trimestre===filtroTrim);
    if(vistaTab==="gastos")   arr=arr.filter(f=>f.tipo==="gasto");
    if(vistaTab==="ingresos") arr=arr.filter(f=>f.tipo==="ingreso");
    if(filters.busqueda) arr=arr.filter(f=>(f.proveedor_cliente||"").toLowerCase().includes(filters.busqueda.toLowerCase())||(f.numero_factura||"").toLowerCase().includes(filters.busqueda.toLowerCase()));
    if(filters.tipo)     arr=arr.filter(f=>f.tipo===filters.tipo);
    if(filters.categorias.length>0)arr=arr.filter(f=>filters.categorias.includes(f.categoria));
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
  },[facturas,filters,sortField,sortDir,vistaTab,filtroAnyo,filtroTrim,historico]);

  const toggleSort=(f)=>{if(sortField===f)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortField(f);setSortDir("asc");}};
  const startEdit=(f)=>{setEditingId(f.id);setEditData({...f});};
  const cancelEdit=()=>{setEditingId(null);setEditData({});};

  const saveEdit = async()=>{
    // Si es histórico, actualizar en el array local
    if(String(editingId).startsWith("hist_")) {
      const nuevos = historico.map(f=>f.id===editingId?{...f,...editData}:f);
      setHistorico(nuevos);
      await guardarHistorico(nuevos);
      setEditingId(null);
      toast("Registro histórico actualizado ✓");
      return;
    }
    try{
      const supa=await db();
      const{error}=await supa.from("facturas").update({tipo:editData.tipo,fecha:editData.fecha,numero_factura:editData.numero_factura,proveedor_cliente:editData.proveedor_cliente,nif_cif:editData.nif_cif,categoria:editData.categoria,total:Number(editData.total),iva_porcentaje:Number(editData.iva_porcentaje),estado:editData.estado}).eq("id",editingId);
      if(error)throw error;
      setEditingId(null);toast("Factura actualizada ✓");onRefresh();
    }catch(e){toast("Error: "+e.message,"err");}
  };

  const saveFechaReal=async(factura, isoDate)=>{
    setEditingFechaReal(null);
    if(String(factura.id).startsWith("hist_")) return;
    try{
      const supa=await db();
      const{error}=await supa.from("facturas").update({fecha_real:isoDate||null}).eq("id",factura.id);
      if(error)throw error;
      toast("Fecha real guardada ✓");onRefresh();
    }catch(e){toast("Error: "+e.message,"err");}
  };

  const deleteF=async(factura)=>{
    const id = typeof factura === "object" ? factura.id : factura;
    // Si es histórico, borrarlo del array de históricos
    if(String(id).startsWith("hist_")) {
      if(!window.confirm("¿Eliminar este registro?")) return;
      const nuevos = historico.filter(f=>f.id!==id);
      setHistorico(nuevos);
      await guardarHistorico(nuevos);
      toast("Eliminado ✓");
      return;
    }
    if(!window.confirm("¿Mover esta factura a la papelera?"))return;
    // Mover archivo en Drive a carpeta "Eliminadas" (si existe)
    if(typeof factura === "object" && factura.drive_url) {
      await moverArchivoAEliminadas(factura);
    }
    try{
      const supa=await db();
      const{error}=await supa.from("facturas").update({eliminado_en: new Date().toISOString()}).eq("id",String(id));
      if(error)throw error;
      toast("Movida a la papelera ✓");
      onRefresh();
    }catch(e){toast("Error al eliminar: "+e.message,"err");}
  };

  const restoreF=async(id)=>{
    try{
      const supa=await db();
      const{error}=await supa.from("facturas").update({eliminado_en: null}).eq("id",id);
      if(error)throw error;
      toast("Factura recuperada ✓");
      onRefresh();
    }catch(e){toast("Error: "+e.message,"err");}
  };

  const deleteForeverF=async(id)=>{
    if(!window.confirm("¿Eliminar definitivamente? Esta acción no se puede deshacer."))return;
    try{
      const supa=await db();
      const{error}=await supa.from("facturas").delete().eq("id",id);
      if(error)throw error;
      toast("Eliminada definitivamente");
      onRefresh();
    }catch(e){toast("Error: "+e.message,"err");}
  };

  const downloadFile=(f)=>{ if(f.archivo_url)window.open(f.archivo_url,"_blank"); else window.alert("Sin archivo adjunto."); };
  const exportExcel=()=>{setExporting(true);try{buildExcel(facturas);}catch(e){window.alert("Error: "+e.message);}setExporting(false);};

  const deleteSelected = async() => {
    if(selected.size===0) return;
    if(!window.confirm(`¿Eliminar ${selected.size} factura${selected.size>1?"s":""}?`)) return;
    const ids = [...selected];
    const histIds = ids.filter(id=>String(id).startsWith("hist_"));
    const supaIds = ids.filter(id=>!String(id).startsWith("hist_"));
    // Borrar históricos
    if(histIds.length>0) {
      const nuevos = historico.filter(f=>!histIds.includes(f.id));
      setHistorico(nuevos);
      await guardarHistorico(nuevos);
    }
    // Borrar de Supabase (papelera) + mover en Drive
    if(supaIds.length>0) {
      // Mover archivos en Drive a "Eliminadas"
      const facturasSelec = filtered.filter(f=>supaIds.includes(f.id)&&f.drive_url);
      await Promise.all(facturasSelec.map(f=>moverArchivoAEliminadas(f)));
      try {
        const supa = await db();
        await supa.from("facturas").update({eliminado_en: new Date().toISOString()}).in("id", supaIds);
        onRefresh();
      } catch(e) { toast("Error: "+e.message,"err"); return; }
    }
    setSelected(new Set());
    toast(`${ids.length} factura${ids.length>1?"s":""} eliminadas ✓`);
  };

  const tG=filtered.filter(f=>f.tipo==="gasto").reduce((s,f)=>s+Number(f.total),0);
  const tI=filtered.filter(f=>f.tipo==="ingreso").reduce((s,f)=>s+Number(f.total),0);
  const ivaG=filtered.filter(f=>f.tipo==="gasto").reduce((s,f)=>s+calcIva(f),0);
  const ivaI=filtered.filter(f=>f.tipo==="ingreso").reduce((s,f)=>s+calcIva(f),0);
  const nG=filtered.filter(f=>f.tipo==="gasto").length;
  const nI=filtered.filter(f=>f.tipo==="ingreso").length;
  const pend=filtered.filter(f=>f.estado==="pendiente").length;

  // Última fecha registrada por tipo (sobre todos los datos, no solo filtrados)
  const allGastos   = [...facturas.filter(f=>!f.eliminado_en&&f.tipo==="gasto"),   ...historico.filter(f=>f.tipo==="gasto")];
  const allIngresos = [...facturas.filter(f=>!f.eliminado_en&&f.tipo==="ingreso"), ...historico.filter(f=>f.tipo==="ingreso")];
  const lastFechaGasto   = allGastos.length>0   ? allGastos.sort((a,b)=>pD(b.fecha)-pD(a.fecha))[0]?.fecha   : null;
  const lastFechaIngreso = allIngresos.length>0 ? allIngresos.sort((a,b)=>pD(b.fecha)-pD(a.fecha))[0]?.fecha : null;
  const Arr=({f})=>sortField===f?<span style={{marginLeft:4,opacity:.7}}>{sortDir==="asc"?"↑":"↓"}</span>:<span style={{marginLeft:4,opacity:.2}}>↕</span>;

  return (
    <div className="view">
      <div className="page-header" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:28}}>
        <div><div className="eyebrow">Módulo 3</div><h1 className="view-title" style={{marginBottom:0}}>Listado de <em>facturas</em></h1></div>
        <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
          {selected.size>0&&<button className="btn-out" style={{borderColor:"rgba(180,30,20,.4)",color:"#8B1A0A"}} onClick={deleteSelected}>{I.del}<span>Eliminar {selected.size}</span></button>}
          <button className="btn-out" onClick={()=>window.alert("ZIP disponible en Netlify.")}>{I.zip}<span>ZIP</span></button>
          <button className="btn-ink" onClick={exportExcel} disabled={exporting}>{I.xl}<span>{exporting?"Generando...":"Exportar Excel"}</span></button>
        </div>
      </div>

      {/* Tabs de vista */}
      <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:"1.5px solid #D4C5A9"}}>
        {[["todas","Total"],["gastos","Gastos"],["ingresos","Ingresos"]].map(([k,l])=>(
          <button key={k} onClick={()=>setVistaTab(k)} style={{padding:"12px 28px",background:"none",border:"none",borderBottom:vistaTab===k?"2.5px solid #B8962E":"2.5px solid transparent",fontFamily:"'Cormorant Garamond',serif",fontSize:16,letterSpacing:".12em",textTransform:"uppercase",color:vistaTab===k?"#2C2417":"#9C8E7A",cursor:"pointer",marginBottom:-1.5,transition:"all .2s",fontWeight:vistaTab===k?500:400}}>{l}</button>
        ))}
      </div>

      {/* Cajas de resumen según vista */}
      <div className="pills" style={{marginBottom:24}}>
        {vistaTab==="todas"&&<>
          <div className="pill"><span className="pill-dot" style={{background:"#C25A4A"}}/>Gastos<span className="pill-val" style={{color:"#8B3A2A"}}>{fmt(tG)}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#5A8A5E"}}/>Ingresos<span className="pill-val" style={{color:"#3A6B3E"}}>{fmt(tI)}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#B8962E"}}/>Pendientes<span className="pill-val">{pend}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#2C2417"}}/>Total<span className="pill-val">{facturas.length} facturas</span></div>
        </>}
        {vistaTab==="gastos"&&<>
          <div className="pill"><span className="pill-dot" style={{background:"#C25A4A"}}/>Total gastos<span className="pill-val" style={{color:"#8B3A2A"}}>{fmt(tG)}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#B8962E"}}/>IVA soportado<span className="pill-val" style={{color:"#8B6914"}}>{fmt(ivaG)}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#2C2417"}}/>Nº facturas<span className="pill-val">{nG}</span></div>
        </>}
        {vistaTab==="ingresos"&&<>
          <div className="pill"><span className="pill-dot" style={{background:"#5A8A5E"}}/>Total ingresos<span className="pill-val" style={{color:"#3A6B3E"}}>{fmt(tI)}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#B8962E"}}/>IVA repercutido<span className="pill-val" style={{color:"#8B6914"}}>{fmt(ivaI)}</span></div>
          <div className="pill"><span className="pill-dot" style={{background:"#2C2417"}}/>Nº facturas<span className="pill-val">{nI}</span></div>
        </>}
      </div>

      {/* Última fecha registrada */}
      <div style={{display:"flex",gap:22,marginBottom:18,flexWrap:"wrap"}}>
        {(vistaTab==="todas"||vistaTab==="gastos")&&lastFechaGasto&&(
          <span style={{fontSize:13,color:"#9C8E7A",fontStyle:"italic"}}>Último gasto: <strong style={{color:"#5C4A2A",fontStyle:"normal"}}>{lastFechaGasto}</strong></span>
        )}
        {(vistaTab==="todas"||vistaTab==="ingresos")&&lastFechaIngreso&&(
          <span style={{fontSize:13,color:"#9C8E7A",fontStyle:"italic"}}>Último ingreso: <strong style={{color:"#5C4A2A",fontStyle:"normal"}}>{lastFechaIngreso}</strong></span>
        )}
      </div>

      <div className="fl-bar">
        <div className="fg" style={{minWidth:190}}><label className="fl">Buscar</label><input className="fi" placeholder="Proveedor, nº factura..." value={filters.busqueda} onChange={e=>setF("busqueda",e.target.value)}/></div>
        <div className="fg"><label className="fl">Tipo</label><select className="fs" value={filters.tipo} onChange={e=>setF("tipo",e.target.value)}><option value="">Todos</option><option value="gasto">Gastos</option><option value="ingreso">Ingresos</option></select></div>
        <div className="fg" style={{minWidth:200,position:"relative"}}>
          <label className="fl">Categoría {filters.categorias.length>0&&<span style={{color:"#B8962E"}}>({filters.categorias.length})</span>}</label>
          <div style={{border:"none",borderBottom:"1.5px solid #9C8E7A",padding:"5px 0",fontSize:16,color:filters.categorias.length===0?"#9C8E7A":"#2C2417",cursor:"pointer",fontFamily:"'Cormorant Garamond',serif",fontStyle:filters.categorias.length===0?"italic":"normal"}} onClick={()=>setF("_catOpen",!filters._catOpen)}>
            {filters.categorias.length===0?"Todas":filters.categorias.length===1?filters.categorias[0]:filters.categorias.length+" seleccionadas"}
          </div>
          {filters._catOpen&&<div style={{position:"absolute",top:"100%",left:0,zIndex:100,background:"#F5F0E8",border:".5px solid #D4C5A9",boxShadow:"0 8px 24px rgba(44,36,23,.15)",minWidth:220,padding:"8px 0"}}>
            {CATS.map(c=>(
              <div key={c} onClick={()=>toggleCat(c)} style={{padding:"9px 16px",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",gap:10,color:filters.categorias.includes(c)?"#2C2417":"#5C4A2A",background:filters.categorias.includes(c)?"rgba(184,150,46,.08)":"none",fontFamily:"'Cormorant Garamond',serif"}}>
                <span style={{width:14,height:14,border:".5px solid "+(filters.categorias.includes(c)?"#B8962E":"#D4C5A9"),background:filters.categorias.includes(c)?"#B8962E":"none",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {filters.categorias.includes(c)&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#F5F0E8" strokeWidth={3}><path d="M4.5 12.75l6 6 9-13.5"/></svg>}
                </span>
                {c}
              </div>
            ))}
            <div style={{borderTop:".5px solid #D4C5A9",margin:"8px 0 0",padding:"8px 16px"}}>
              <button className="btn-sm" onClick={()=>{setF("categorias",[]);setF("_catOpen",false);}}>Limpiar</button>
            </div>
          </div>}
        </div>
        <div className="fg"><label className="fl">Estado</label><select className="fs" value={filters.estado} onChange={e=>setF("estado",e.target.value)}><option value="">Todos</option><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option></select></div>
        <div className="fg"><label className="fl">Desde</label><input type="date" className="fi" value={filters.fechaDesde} onChange={e=>setF("fechaDesde",e.target.value)}/></div>
        <div className="fg"><label className="fl">Hasta</label><input type="date" className="fi" value={filters.fechaHasta} onChange={e=>setF("fechaHasta",e.target.value)}/></div>
        <div className="fg" style={{minWidth:100}}>
          <label className="fl">Año</label>
          <select className="fs" value={filtroAnyo} onChange={e=>setFiltroAnyo(e.target.value)}>
            <option value="">Todos</option>
            {anyosDisponibles.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="fg" style={{minWidth:90}}>
          <label className="fl">Trimestre</label>
          <select className="fs" value={filtroTrim} onChange={e=>setFiltroTrim(e.target.value)}>
            <option value="">Todo el año</option>
            <option value="T1">T1</option>
            <option value="T2">T2</option>
            <option value="T3">T3</option>
            <option value="T4">T4</option>
          </select>
        </div>
        <button className="btn-sm" onClick={()=>{resetF();setFiltroAnyo(_anyoActual);setFiltroTrim(_trimActual);}}>Limpiar</button>
      </div>

      <div className="twrap">
        <table>
          <thead><tr>
            <th className="chk-col" style={{width:36}}><input type="checkbox" onChange={selectAll} checked={selected.size===filtered.length&&filtered.length>0} style={{cursor:"pointer",width:15,height:15,accentColor:"#B8962E"}}/></th>
            <th>Tipo</th>
            <th className={`sort${sortField==="fecha"?" sorted":""}`} onClick={()=>toggleSort("fecha")}>Fecha<Arr f="fecha"/></th>
            <th style={{fontSize:12,color:"#9C8E7A"}}>Fecha real</th>
            <th className="col-hide-mobile">Nº Factura</th>
            <th>Proveedor / Cliente</th>
            <th className="col-hide-mobile" style={{textAlign:"right"}}>Base imp.</th>
            <th className="col-hide-mobile" style={{textAlign:"right"}}>IVA</th>
            <th className={`sort${sortField==="total"?" sorted":""}`} onClick={()=>toggleSort("total")} style={{textAlign:"right"}}>Total<Arr f="total"/></th>
            <th className="col-hide-mobile">Categoría</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr></thead>
          <tbody>
            {loading&&<tr><td colSpan={13}><div className="loading-row"><div className="spin"/><span>Cargando desde Supabase...</span></div></td></tr>}
            {!loading&&filtered.length===0&&<tr><td colSpan={13} className="empty-row">{facturas.length===0?"Aún no hay facturas — sube la primera en el módulo 2":"Sin resultados con estos filtros"}</td></tr>}
            {!loading&&filtered.map((f,i)=>{
              const isE=editingId===f.id,d=isE?editData:f;
              return(
                <tr key={f.id} className={"dr"+(isE?" editing":"")} style={{animationDelay:i*.025+"s",background:selected.has(f.id)?"rgba(184,150,46,.08)":""}}>
                  <td className="chk-col" style={{textAlign:"center"}}><input type="checkbox" checked={selected.has(f.id)} onChange={()=>toggleSelect(f.id)} onClick={e=>e.stopPropagation()} style={{cursor:"pointer",width:15,height:15,accentColor:"#B8962E"}}/></td>
                  <td>
                    {isE?<select className="is" value={d.tipo} onChange={e=>setEditData(p=>({...p,tipo:e.target.value}))}><option value="gasto">Gasto</option><option value="ingreso">Ingreso</option></select>
                    :<>
                      <div className="tipo-full" style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        <span className={"badge badge-"+f.tipo}>{f.tipo==="gasto"?"Gasto":"Ingreso"}</span>
                        {f.es_duplicada&&<span className="badge" style={{background:"rgba(180,30,20,.1)",color:"#8B1A0A",border:".5px solid rgba(180,30,20,.4)"}}>⚠ Dup.</span>}
                      </div>
                      <span className="tipo-short" style={{background:f.tipo==="gasto"?"rgba(139,58,42,.12)":"rgba(58,107,62,.12)",color:f.tipo==="gasto"?"#8B3A2A":"#3A6B3E"}}>{f.tipo==="gasto"?"G":"I"}</span>
                    </>}
                  </td>
                  <td>{isE?<input className="ii" value={d.fecha||""} onChange={e=>setEditData(p=>({...p,fecha:e.target.value}))} style={{width:95}}/>:f.fecha}</td>
                  <td style={{color:"#9C8E7A",fontSize:12,whiteSpace:"nowrap"}}>
                    {editingFechaReal===f.id
                      ? <input type="date" className="ii" defaultValue={f.fecha_real||""} autoFocus style={{width:120}} onBlur={e=>saveFechaReal(f,e.target.value)} onChange={e=>e.target.value&&saveFechaReal(f,e.target.value)}/>
                      : <span style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4}} onClick={()=>setEditingFechaReal(f.id)}>
                          {f.fecha_real ? (()=>{const[y,m,d]=(f.fecha_real||"").split("-");return d?`${d}/${m}/${y}`:f.fecha_real;})() : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} style={{opacity:.4}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>}
                        </span>
                    }
                  </td>
                  <td className="col-hide-mobile" style={{color:"#9C8E7A",fontSize:13}}>{isE?<input className="ii" value={d.numero_factura||""} onChange={e=>setEditData(p=>({...p,numero_factura:e.target.value}))}/>:f.numero_factura}</td>
                  <td style={{fontWeight:500}}>{isE?<input className="ii" value={d.proveedor_cliente||""} onChange={e=>setEditData(p=>({...p,proveedor_cliente:e.target.value}))}/>:f.proveedor_cliente}</td>
                  <td className="col-hide-mobile" style={{textAlign:"right",color:"#5C4A2A",fontSize:13}}>{isE?"":fmt(calcBase(f))}</td>
                  <td className="col-hide-mobile" style={{textAlign:"right",color:"#5C4A2A",fontSize:13}}>{isE?"":fmt(calcIva(f))}</td>
                  <td style={{fontWeight:500,color:f.tipo==="gasto"?"#8B3A2A":"#3A6B3E",textAlign:"right"}}>
                    {isE
                      ? <input className="ii" type="number" value={d.total||0} onChange={e=>setEditData(p=>({...p,total:e.target.value}))} style={{width:85}}/>
                      : fmt(f.total)
                    }
                  </td>
                  <td className="col-hide-mobile" style={{fontSize:12,color:"#5C4A2A"}}>{isE?<select className="is" value={d.categoria||""} onChange={e=>setEditData(p=>({...p,categoria:e.target.value}))}>{CATS.map(c=><option key={c}>{c}</option>)}</select>:f.categoria}</td>
                  <td>
                    {isE
                      ? <select className="is" value={d.estado||"pendiente"} onChange={e=>setEditData(p=>({...p,estado:e.target.value}))}><option value="pagada">Pagada</option><option value="pendiente">Pendiente</option></select>
                      : <>
                          <span className="estado-full"><span className={"badge badge-"+f.estado}><span className={"e-dot dot-"+f.estado}/>{f.estado}</span></span>
                          <span className="estado-dot" style={{background:f.estado==="pagada"?"#3A6B3E":f.estado==="pendiente"?"#B8962E":"#9C8E7A"}}/>
                        </>
                    }
                  </td>
                  <td style={{position:"relative"}}>
                    <div className="acts acts-desk">
                      {isE?<><button className="ib sv" onClick={saveEdit}>{I.ok}</button><button className="ib" onClick={cancelEdit}>{I.x}</button></>
                      :<><button className="ib eye" title={f.drive_url||f.archivo_url?"Abrir en Drive":"Ver detalles"} onClick={()=>{const u=f.drive_url||f.archivo_url;if(u)window.open(u,"_blank");else setVisor(f);}}>{I.eye}</button><button className="ib" onClick={()=>startEdit(f)}>{I.edit}</button><button className="ib del" onClick={()=>deleteF(f)}>{I.del}</button></>}
                    </div>
                    <div className="acts-mob">
                      {isE?<><button className="ib sv" onClick={saveEdit}>{I.ok}</button><button className="ib" onClick={cancelEdit}>{I.x}</button></>
                      :<>
                        <button className="ib" onClick={()=>setActionsOpen(actionsOpen===f.id?null:f.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                        </button>
                        {actionsOpen===f.id&&(
                          <div className="acts-drop">
                            <button onClick={()=>{const u=f.drive_url||f.archivo_url;if(u)window.open(u,"_blank");else setVisor(f);setActionsOpen(null);}}>{I.eye} Ver</button>
                            <button onClick={()=>{startEdit(f);setActionsOpen(null);}}>{I.edit} Editar</button>
                            <button className="del-opt" onClick={()=>{deleteF(f);setActionsOpen(null);}}>{I.del} Eliminar</button>
                          </div>
                        )}
                      </>}
                    </div>
                  </td>
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
                {(visor.drive_url||visor.archivo_url)
                  ? <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"24px 0"}}>
                      {I.pdf}
                      <span style={{fontSize:15,color:"#5C4A2A"}}>{visor.archivo_nombre||"Archivo adjunto"}</span>
                      <a href={visor.drive_url||visor.archivo_url} target="_blank" rel="noopener noreferrer" className="btn-ink" style={{textDecoration:"none",display:"flex",alignItems:"center",gap:8}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        <span>Abrir en Drive</span>
                      </a>
                    </div>
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
              {(visor.drive_url||visor.archivo_url)&&<button className="btn-ink" onClick={()=>window.open(visor.drive_url||visor.archivo_url,"_blank")}>{I.down}<span>Abrir en Drive</span></button>}
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

function ViewDashboard({ facturas, historico }) {
  const [vista,  setVista]  = useState("resumen");
  const [periodo,setPeriodo]= useState("mensual");
  const [cSub,   setCSub]   = useState("ingresos");

  const _hoy2 = new Date();
  const _anyoAct = _hoy2.getFullYear().toString();
  const todosLosDatos = [...facturas.filter(f=>!f.eliminado_en), ...(historico||[])];
  const useMock = todosLosDatos.length===0;
  const gas=(useMock?MOCK:todosLosDatos).filter(f=>f.tipo==="gasto");
  const ing=(useMock?MOCK:todosLosDatos).filter(f=>f.tipo==="ingreso");
  const tG=gas.reduce((s,f)=>s+Number(f.total),0);
  const tI=ing.reduce((s,f)=>s+Number(f.total),0);
  const bal=tI-tG;
  const ivaR=ing.reduce((s,f)=>s+calcIva(f),0);
  const ivaS=gas.reduce((s,f)=>s+calcIva(f),0);
  const ivaN=ivaR-ivaS;
  const pend=(facturas.length>0?facturas:MOCK).filter(f=>f.estado==="pendiente");

  const chartData = useMemo(()=>{
    const meses=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const anoActual=new Date().getFullYear().toString();
    const byMes=(arr,mes,tipo)=>arr.filter(f=>f.fecha&&parseInt(f.fecha.split("/")[1])===mes&&f.tipo===tipo).reduce((s,f)=>s+Number(f.total),0);
    const byTrim=(arr,idxs,tipo)=>idxs.map(i=>i+1).reduce((s,m)=>s+byMes(arr,m,tipo),0);
    const hist=historico||[];
    if(periodo==="mensual"){
      return meses.map((mes,i)=>({
        mes,
        gastos:byMes(facturas,i+1,"gasto"),
        ingresos:byMes(facturas,i+1,"ingreso"),
        gastos24:byMes(hist,i+1,"gasto")||MOCK_2024[i].g,
        ingresos24:byMes(hist,i+1,"ingreso")||MOCK_2024[i].i,
      }));
    }
    if(periodo==="trimestral"){
      return Object.entries(TRIM).map(([t,idxs])=>({
        mes:t,
        gastos:byTrim(facturas,idxs,"gasto"),
        ingresos:byTrim(facturas,idxs,"ingreso"),
        gastos24:byTrim(hist,idxs,"gasto")||idxs.reduce((s,i)=>s+MOCK_2024[i].g,0),
        ingresos24:byTrim(hist,idxs,"ingreso")||idxs.reduce((s,i)=>s+MOCK_2024[i].i,0),
      }));
    }
    const g24=hist.length>0?hist.filter(f=>f.tipo==="gasto").reduce((s,f)=>s+Number(f.total),0):MOCK_2024.reduce((s,m)=>s+m.g,0);
    const i24=hist.length>0?hist.filter(f=>f.tipo==="ingreso").reduce((s,f)=>s+Number(f.total),0):MOCK_2024.reduce((s,m)=>s+m.i,0);
    return [{mes:anoActual,gastos:tG,ingresos:tI},{mes:String(Number(anoActual)-1),gastos:g24,ingresos:i24}];
  },[facturas,historico,periodo,tG,tI]);

  const catData = useMemo(()=>{
    const src = vista==="ingresos" ? ing : gas;
    const cats=[...new Set(src.map(f=>f.categoria))];
    return cats.map(c=>({name:c,value:src.filter(f=>f.categoria===c).reduce((s,f)=>s+Number(f.total),0)})).sort((a,b)=>b.value-a.value).slice(0,7);
  },[facturas,vista]);

  const topProv = useMemo(()=>Object.entries(gas.reduce((acc,f)=>{acc[f.proveedor_cliente]=(acc[f.proveedor_cliente]||0)+Number(f.total);return acc;},{})).map(([n,t])=>({n,t})).sort((a,b)=>b.t-a.t).slice(0,5),[gas]);
  const maxProv = topProv[0]?.t||1;

  // IVA trimestral dinámico desde datos reales
  const ivaData = useMemo(()=>{
    const anyoActual = new Date().getFullYear().toString();
    const datosTrimestre = (t) => {
      const meses = TRIM[t].map(i=>i+1); // meses 1-12
      const gastosTrim = gas.filter(f=>{
        const m = parseInt((f.fecha||"").split("/")[1]);
        const a = (f.fecha||"").split("/")[2];
        return meses.includes(m) && (!a || a===anyoActual || useMock);
      });
      const ingresosTrim = ing.filter(f=>{
        const m = parseInt((f.fecha||"").split("/")[1]);
        const a = (f.fecha||"").split("/")[2];
        return meses.includes(m) && (!a || a===anyoActual || useMock);
      });
      const ivaS = gastosTrim.reduce((s,f)=>s+calcIva(f),0);
      const ivaR = ingresosTrim.reduce((s,f)=>s+calcIva(f),0);
      return {t, ivaS, ivaR, net: ivaR-ivaS};
    };
    return ["T1","T2","T3","T4"].map(t=>datosTrimestre(t));
  },[gas,ing,useMock]);

  const barSerie = vista==="gastos"?"gastos":vista==="ingresos"?"ingresos":cSub;
  const barCol   = {gastos:"#C25A4A",ingresos:"#5A8A5E",gastos24:"rgba(194,90,74,.35)",ingresos24:"rgba(90,138,94,.35)"};

  // Calcular totales año anterior desde histórico
  const anyoAnt = String(new Date().getFullYear()-1);
  const datosAntI = (historico||[]).filter(f=>f._anyo===anyoAnt&&f.tipo==="ingreso");
  const datosAntG = (historico||[]).filter(f=>f._anyo===anyoAnt&&f.tipo==="gasto");
  const tIant = datosAntI.reduce((s,f)=>s+Number(f.total),0);
  const tGant = datosAntG.reduce((s,f)=>s+Number(f.total),0);
  const deltaI = tIant>0?((tI-tIant)/tIant*100).toFixed(1):null;
  const deltaG = tGant>0?((tG-tGant)/tGant*100).toFixed(1):null;

  const kpis = vista==="resumen"?[
    {lbl:"Total ingresos",val:fmt(tI),sub:tIant>0?`vs ${fmt(tIant)} año anterior`:"Sin datos año anterior",delta:deltaI,up:deltaI!==null?Number(deltaI)>=0:null,ac:"#5A8A5E",cl:"#3A6B3E"},
    {lbl:"Total gastos",val:fmt(tG),sub:tGant>0?`vs ${fmt(tGant)} año anterior`:"Sin datos año anterior",delta:deltaG,up:deltaG!==null?Number(deltaG)<=0:null,ac:"#C25A4A",cl:"#8B3A2A"},
    {lbl:"Balance",val:fmt(bal),sub:"ingresos − gastos",ac:bal>=0?"#5A8A5E":"#C25A4A",cl:bal>=0?"#3A6B3E":"#8B3A2A"},
    {lbl:"IVA neto a pagar",val:fmt(Math.abs(ivaN)),sub:`↑ Repercutido: ${fmt(ivaR)}\n↓ Soportado: ${fmt(ivaS)}`,ac:"#8B6914",cl:"#8B6914"},
    {lbl:"Facturas pendientes",val:pend.length,sub:fmt(pend.reduce((s,f)=>s+Number(f.total),0))+" en espera",ac:"#B8962E",cl:"#8B6914"},
  ]:vista==="gastos"?[
    {lbl:"Total gastos",val:fmt(tG),sub:tGant>0?`vs ${fmt(tGant)} año anterior`:"Sin datos año anterior",delta:deltaG,up:deltaG!==null?Number(deltaG)<=0:null,ac:"#C25A4A",cl:"#8B3A2A"},
    {lbl:"Mayor categoría",val:catData[0]?.name||"—",sub:fmt(catData[0]?.value||0),ac:"#B8962E",cl:"#8B6914"},
    {lbl:"Facturas gasto",val:gas.length,sub:"en el período",ac:"#2C2417",cl:"#2C2417"},
    {lbl:"IVA soportado",val:fmt(ivaS),sub:"deducible",ac:"#7A6A50",cl:"#5C4A2A"},
  ]:[
    {lbl:"Total ingresos",val:fmt(tI),sub:tIant>0?`vs ${fmt(tIant)} año anterior`:"Sin datos año anterior",delta:deltaI,up:deltaI!==null?Number(deltaI)>=0:null,ac:"#5A8A5E",cl:"#3A6B3E"},
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
            {k.delta!==null&&k.up!==null&&<div className={"kpi-delta "+(k.up?"dpos":"dneg")}>{k.up?"▲":"▼"} {Math.abs(k.delta)}% vs año anterior</div>}
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
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={catData} cx="50%" cy="50%" innerRadius="40%" outerRadius="70%" paddingAngle={3} dataKey="value">
                {catData.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}
              </Pie>
              <Tooltip content={({active,payload})=>{
                if(!active||!payload?.length) return null;
                const p=payload[0];
                const total=catData.reduce((s,d)=>s+d.value,0);
                const pct=total>0?(p.value/total*100).toFixed(1):0;
                return <div style={{background:"#F5F0E8",border:".5px solid #B8962E",padding:"10px 14px",fontFamily:"'Cormorant Garamond',Georgia,serif",boxShadow:"0 4px 16px rgba(44,36,23,.15)"}}>
                  <div style={{fontSize:13,letterSpacing:".1em",textTransform:"uppercase",color:"#8B6914",marginBottom:4}}>{p.name}</div>
                  <div style={{fontSize:16,fontWeight:500,color:"#2C2417"}}>{fmt(p.value)}</div>
                  <div style={{fontSize:14,color:"#5C4A2A"}}>{pct}% del total</div>
                </div>;
              }}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
            {catData.map((d,i)=>{
              const total=catData.reduce((s,x)=>s+x.value,0);
              const pct=total>0?(d.value/total*100).toFixed(1):0;
              return <div key={i} style={{display:"flex",alignItems:"center",gap:10,fontFamily:"'Cormorant Garamond',serif",padding:"4px 0",borderBottom:".5px solid #EDE5D0"}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:CAT_COLORS[i%CAT_COLORS.length],flexShrink:0}}/>
                <span style={{flex:1,fontSize:14,color:"#2C2417"}}>{d.name}</span>
                <span style={{fontSize:18,fontWeight:700,color:CAT_COLORS[i%CAT_COLORS.length],minWidth:48,textAlign:"right"}}>{pct}%</span>
                <span style={{fontSize:13,color:"#9C8E7A",minWidth:90,textAlign:"right"}}>{fmt(d.value)}</span>
              </div>;
            })}
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
                {(()=>{
                  const hist=historico||[];
                  const byT=(arr,idxs,tipo)=>idxs.map(i=>i+1).reduce((s,m)=>s+arr.filter(f=>f.fecha&&parseInt(f.fecha.split("/")[1])===m&&f.tipo===tipo).reduce((a,f)=>a+Number(f.total),0),0);
                  const rows=[
                    {lbl:`Ingresos ${new Date().getFullYear()}`,tipo:"ingreso",src:facturas,c:"#3A6B3E"},
                    {lbl:`Ingresos ${new Date().getFullYear()-1}`,tipo:"ingreso",src:hist,c:"rgba(58,107,62,.5)"},
                    {lbl:`Gastos ${new Date().getFullYear()}`,tipo:"gasto",src:facturas,c:"#8B3A2A"},
                    {lbl:`Gastos ${new Date().getFullYear()-1}`,tipo:"gasto",src:hist,c:"rgba(139,58,42,.5)"},
                  ];
                  return rows.map((row,ri)=>{
                    const vals=Object.values(TRIM).map(idxs=>byT(row.src,idxs,row.tipo));
                    const prevVals=ri%2===0?Object.values(TRIM).map(idxs=>byT(rows[ri+1].src,idxs,row.tipo)):null;
                    return (
                      <tr key={ri} style={{borderBottom:ri===1?"1px solid #D4C5A9":undefined}}>
                        <td style={{textAlign:"left",color:row.c,fontStyle:ri%2===1?"italic":"normal"}}>{row.lbl}</td>
                        {vals.map((val,ti)=>{
                          const prev=prevVals?.[ti]||0;
                          const delta=prev>0?((val-prev)/prev*100).toFixed(0):null;
                          return <td key={ti} style={{color:row.c}}>{fmtK(val)}{delta!==null&&<span style={{fontSize:11,marginLeft:5,color:(row.tipo==="ingreso"?Number(delta)>=0:Number(delta)<=0)?"#2E6B32":"#8B3A2A"}}>{Number(delta)>=0?"▲":"▼"}{Math.abs(delta)}%</span>}</td>;
                        })}
                      </tr>
                    );
                  });
                })()}
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
                <div className="iva-val" style={{color:d.net>=0?"#8B3A2A":"#3A6B3E"}}>{fmtK(Math.abs(d.net))}</div>
                <div className="iva-s">{d.net>=0?"a pagar":"a devolver"}</div>
                <div style={{fontSize:12,color:"#9C8E7A",marginTop:4}}>↑{fmtK(d.ivaR)} ↓{fmtK(d.ivaS)}</div>
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
  const ivaR = ing.reduce((s,f)=>s+calcIva(f),0);
  const ivaS = gas.reduce((s,f)=>s+calcIva(f),0);
  const pend = data.filter(f=>f.estado==="pendiente").length;

  const trimData = ["T1","T2","T3","T4"].map(t=>({
    t,
    ing:facturas.filter(f=>f.tipo==="ingreso"&&f.trimestre===t).reduce((s,f)=>s+Number(f.total),0),
    gas:facturas.filter(f=>f.tipo==="gasto"&&f.trimestre===t).reduce((s,f)=>s+Number(f.total),0),
    ivaR:facturas.filter(f=>f.tipo==="ingreso"&&f.trimestre===t).reduce((s,f)=>s+calcIva(f),0),
    ivaS:facturas.filter(f=>f.tipo==="gasto"&&f.trimestre===t).reduce((s,f)=>s+calcIva(f),0),
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
// VISTA: HISTORIAL / PAPELERA
// ═══════════════════════════════════════════════════════════
function ViewHistorial({ onRefresh, toast }) {
  const [eliminadas, setEliminadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const ahora = new Date();

  const cargarEliminadas = useCallback(async()=>{
    setCargando(true);
    try {
      const supa = await db();
      const {data,error} = await supa.from("facturas").select("*").not("eliminado_en","is",null).order("eliminado_en",{ascending:false});
      if(error) throw error;
      setEliminadas(data||[]);
    } catch(e) { setEliminadas([]); }
    setCargando(false);
  },[]);

  useEffect(()=>{ cargarEliminadas(); },[cargarEliminadas]);

  const horasRestantes = (f) => {
    const eliminado = new Date(f.eliminado_en);
    const diff = 48 - (ahora - eliminado) / 3600000;
    return Math.max(0, diff).toFixed(0);
  };

  const restoreF = async(id) => {
    try {
      const supa = await db();
      const {error} = await supa.from("facturas").update({eliminado_en: null}).eq("id", id);
      if(error) throw error;
      toast("Factura recuperada ✓");
      onRefresh();
      cargarEliminadas();
    } catch(e) { toast("Error: "+e.message,"err"); }
  };

  const deleteForeverF = async(id) => {
    if(!window.confirm("¿Eliminar definitivamente? Esta acción no se puede deshacer.")) return;
    try {
      const supa = await db();
      const {error} = await supa.from("facturas").delete().eq("id", id);
      if(error) throw error;
      toast("Eliminada definitivamente");
      cargarEliminadas();
    } catch(e) { toast("Error: "+e.message,"err"); }
  };

  return (
    <div className="view">
      <div className="eyebrow">Papelera</div>
      <h1 className="view-title">Historial <em>eliminadas</em></h1>
      <p style={{fontSize:16,color:"#9C8E7A",fontStyle:"italic",marginBottom:28}}>Las facturas eliminadas se conservan 48 horas. Después se borran automáticamente.</p>

      {cargando && <div style={{textAlign:"center",padding:"64px 0",color:"#9C8E7A",fontStyle:"italic",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}><div className="spin"/>Cargando papelera...</div>}
      {!cargando && eliminadas.length===0 && (
        <div style={{textAlign:"center",padding:"64px 0",color:"#9C8E7A",fontStyle:"italic",fontSize:18}}>La papelera está vacía ✓</div>
      )}

      {!cargando && eliminadas.length>0 && (
        <div className="twrap">
          <table>
            <thead><tr>
              <th>Tipo</th><th>Fecha</th><th>Nº Factura</th><th>Proveedor / Cliente</th>
              <th>Total</th><th>Eliminada</th><th>Expira en</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              {eliminadas.map((f,i)=>{
                const horas = horasRestantes(f);
                const urgente = Number(horas) < 6;
                return (
                  <tr key={f.id} className="dr" style={{opacity:.8}}>
                    <td><span className={"badge badge-"+f.tipo}>{f.tipo==="gasto"?"Gasto":"Ingreso"}</span></td>
                    <td>{f.fecha}</td>
                    <td style={{color:"#9C8E7A",fontSize:14}}>{f.numero_factura}</td>
                    <td style={{fontWeight:500}}>{f.proveedor_cliente}</td>
                    <td style={{fontWeight:500,color:f.tipo==="gasto"?"#8B3A2A":"#3A6B3E"}}>{fmt(f.total)}</td>
                    <td style={{fontSize:13,color:"#9C8E7A"}}>{new Date(f.eliminado_en).toLocaleString("es-ES")}</td>
                    <td style={{fontSize:14,color:urgente?"#8B3A2A":"#8B6914",fontWeight:500}}>{horas}h</td>
                    <td>
                      <div className="acts">
                        <button className="ib sv" title="Recuperar" onClick={()=>restoreF(f.id)}>{I.ok}</button>
                        <button className="ib del" title="Eliminar definitivamente" onClick={()=>deleteForeverF(f.id)}>{I.del}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function AtelierApp() {
  const [vista,      setVista]      = useState("subida");
  const [facturas,   setFacturas]   = useState([]);
  const [historico,  setHistorico]  = useState([]);
  const [cargandoHist, setCargandoHist] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [toast,      setToast]      = useState(null);

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

  // Cargar histórico — primero localStorage (rápido), luego Supabase Storage (compartido)
  useEffect(()=>{
    const cargarHistorico = async () => {
      setCargandoHist(true);
      // Carga inmediata desde localStorage
      try {
        const local = localStorage.getItem("atelier_historico_v2");
        if(local) setHistorico(JSON.parse(local));
      } catch(e) {}
      // Luego intentar Supabase Storage (puede tener versión más reciente de otro usuario)
      try {
        const supa = await db();
        const {data} = await supa.storage.from("facturas").download("historico/datos.json");
        if(data) {
          const text = await data.text();
          const remoto = JSON.parse(text);
          setHistorico(remoto);
          // Actualizar localStorage con la versión remota
          try { localStorage.setItem("atelier_historico_v2", JSON.stringify(remoto)); } catch(e) {}
        }
      } catch(e) {
        // Si no existe en Storage, usamos el localStorage
      }
      setCargandoHist(false);
    };
    cargarHistorico();
  },[]);

  // Guardar histórico en Supabase Storage cuando cambia
  const guardarHistorico = async (nuevos) => {
    // Guardar en localStorage como backup rápido
    try { localStorage.setItem("atelier_historico_v2", JSON.stringify(nuevos)); } catch(e) {}
    // Guardar en Supabase Storage para compartir con el equipo
    try {
      const supa = await db();
      const blob = new Blob([JSON.stringify(nuevos)], {type:"application/json"});
      await supa.storage.from("facturas").upload("historico/datos.json", blob, {upsert:true, contentType:"application/json"});
    } catch(e) {
      console.warn("Error guardando histórico en Storage:", e.message);
    }
  };

  const NAV = [
    {id:"subida",   label:"Subir facturas", icon:I.upload},
    {id:"listado",  label:"Listado",         icon:I.list},
    {id:"dashboard",label:"Dashboard",       icon:I.dash},
    {id:"exportar", label:"Exportar",        icon:I.export},
    {id:"historial",label:"Papelera",        icon:I.del},
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
          {vista==="listado"   && <ViewListado   facturas={facturas} historico={historico} setHistorico={setHistorico} guardarHistorico={guardarHistorico} cargandoHist={cargandoHist} loading={loading} onRefresh={cargar} toast={showToast}/>}
          {vista==="dashboard" && <ViewDashboard facturas={facturas} historico={historico}/>}
          {vista==="exportar"  && <ViewExportar  facturas={facturas} toast={showToast}/>}
          {vista==="historial" && <ViewHistorial onRefresh={cargar} toast={showToast}/>}
        </main>
        <nav className="mob-nav">
          {NAV.map(n=>(
            <button key={n.id} className={"mob-nav-it"+(vista===n.id?" active":"")} onClick={()=>setVista(n.id)}>
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {toast&&<div className={"toast toast-"+toast.type}>{toast.msg}</div>}
    </>
  );
}
