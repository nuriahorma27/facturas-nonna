const https = require("https");
 
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
 
function httpsRequestRaw(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
 
exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
 
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
 
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }
 
  try {
    const payload = JSON.parse(event.body);
 
    // ── Ruta 1: Subida a Google Drive ─────────────────────────
    if (payload.action === "drive-upload") {
      const APPS_SCRIPT_URL = payload.appsScriptUrl;
      const url = new URL(APPS_SCRIPT_URL);
 
      // Construir form-data manualmente
      const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
      const fields = [
        { name: "file",      value: payload.file },
        { name: "nombre",    value: payload.nombre },
        { name: "mimeType",  value: payload.mimeType },
        { name: "trimestre", value: payload.trimestre },
        { name: "anyo",      value: String(payload.anyo) },
      ];
 
      let formBody = "";
      for (const f of fields) {
        formBody += `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`;
      }
      formBody += `--${boundary}--\r\n`;
 
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": Buffer.byteLength(formBody),
        },
        maxRedirects: 5,
      };
 
      // Apps Script redirige — seguimos la redirección manualmente
      const result = await httpsRequestRaw(options, formBody);
 
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, status: result.status }),
      };
    }
 
    // ── Ruta 2: Extracción con IA ──────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }) };
    }
 
    const requestBody = JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: payload.messages,
    });
 
    const result = await httpsRequest({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    }, requestBody);
 
    return {
      statusCode: result.status,
      headers,
      body: JSON.stringify(result.body),
    };
 
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
 
