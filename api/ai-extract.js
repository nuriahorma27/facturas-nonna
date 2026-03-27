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

function httpsRequestRaw(options, body, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      // Seguir redirecciones (302, 301)
      if ((res.statusCode === 302 || res.statusCode === 301) && res.headers.location && redirectCount < 5) {
        const location = res.headers.location;
        const redirectUrl = new URL(location);
        const newOptions = {
          hostname: redirectUrl.hostname,
          path: redirectUrl.pathname + redirectUrl.search,
          method: "POST",
          headers: {
            "Content-Type": options.headers["Content-Type"],
            "Content-Length": options.headers["Content-Length"],
          },
        };
        resolve(httpsRequestRaw(newOptions, body, redirectCount + 1));
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = async function(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!payload) throw new Error("Empty request body");

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
        { name: "tipo",      value: payload.tipo || "gasto" },
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

      // Intentar extraer la URL del archivo desde la respuesta del Apps Script
      let fileUrl = null;
      try {
        const parsed = JSON.parse(result.body);
        fileUrl = parsed.fileUrl || parsed.url || parsed.webViewLink || parsed.webContentLink || null;
      } catch(e) {
        // La respuesta puede ser una URL directa en texto plano
        const trimmed = (result.body || "").toString().trim();
        if (trimmed.startsWith("http")) fileUrl = trimmed;
      }

      return res.status(200).json({ success: true, status: result.status, fileUrl });
    }

    // ── Ruta 2: Extracción con IA ──────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
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

    return res.status(result.status).json(result.body);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
