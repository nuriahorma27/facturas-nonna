// ============================================================
// ATELIER LA NONNA — Google Apps Script
// Sube facturas a Drive y gestiona carpetas organizadas
//
// INSTRUCCIONES PARA DESPLEGAR:
//   1. Abre script.google.com → abre tu proyecto existente
//   2. Reemplaza todo el contenido con este código
//   3. Guarda (Ctrl+S)
//   4. Implementar → Nueva implementación → Aplicación web
//      · Ejecutar como: Yo
//      · Quién tiene acceso: Cualquiera
//   5. Copia la URL y asegúrate de que en App.jsx sea la nueva
// ============================================================

var CARPETA_RAIZ_ID = "1_-4IPitaopGpH6XCfcvOIhcB6c9V1cM5";

// Obtiene una subcarpeta por nombre, o la crea si no existe
function getOrCreate(parent, name) {
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

// ------------------------------------------------------------
function doPost(e) {
  try {
    // Aceptar JSON (nuevo) o form-data (backwards compat)
    var data = {};
    if (e.postData && e.postData.type === "application/json") {
      data = JSON.parse(e.postData.contents);
    } else {
      data = e.parameter || {};
    }

    var action = data.action || "upload";

    // ── Acción: mover archivo a carpeta "Eliminadas" ──────────
    if (action === "move-to-eliminadas") {
      var fileId    = data.fileId;
      var trimestre = data.trimestre || "T1";
      var anyo      = data.anyo     || new Date().getFullYear().toString();
      var tipo      = data.tipo     || "gasto";

      var nombreTrim = trimestre + " - " + anyo;
      var nombreTipo = (tipo === "ingreso") ? "Ingresos" : "Gastos";

      var raiz          = DriveApp.getFolderById(CARPETA_RAIZ_ID);
      var carpetaTrim   = getOrCreate(raiz,       nombreTrim);
      var carpetaTipo   = getOrCreate(carpetaTrim, nombreTipo);
      var carpetaEliminadas = getOrCreate(carpetaTipo, "Eliminadas");

      var file = DriveApp.getFileById(fileId);
      carpetaEliminadas.addFile(file);
      // Quitar de la carpeta original
      var parents = file.getParents();
      if (parents.hasNext()) {
        var original = parents.next();
        // Solo quitar si no es ya la carpeta "Eliminadas"
        if (original.getId() !== carpetaEliminadas.getId()) {
          original.removeFile(file);
        }
      }

      return ContentService
        .createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Acción por defecto: subir archivo ────────────────────
    var b64      = data.file;
    var nombre   = data.nombre    || ("factura_" + Date.now() + ".jpg");
    var mimeType = data.mimeType  || "image/jpeg";
    var trimestre= data.trimestre || "T1";
    var anyo     = data.anyo      || new Date().getFullYear().toString();
    var tipo     = data.tipo      || "gasto";

    // Estructura: Raíz / "T1 - 2025" / "Ingresos" o "Gastos"
    var nombreTrim = trimestre + " - " + anyo;
    var nombreTipo = (tipo === "ingreso") ? "Ingresos" : "Gastos";

    var raiz      = DriveApp.getFolderById(CARPETA_RAIZ_ID);
    var carpetaTrim = getOrCreate(raiz, nombreTrim);
    var subcarpeta  = getOrCreate(carpetaTrim, nombreTipo);

    // Decodificar base64 y crear el archivo
    var bytes = Utilities.base64Decode(b64);
    var blob  = Utilities.newBlob(bytes, mimeType, nombre);
    var file  = subcarpeta.createFile(blob);

    // Hacer el archivo accesible por enlace
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileUrl = "https://drive.google.com/file/d/" + file.getId() + "/view";

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        fileUrl: fileUrl,
        fileId:  file.getId()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET de prueba — abre la URL en el navegador para verificar que funciona
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", carpeta: CARPETA_RAIZ_ID }))
    .setMimeType(ContentService.MimeType.JSON);
}
