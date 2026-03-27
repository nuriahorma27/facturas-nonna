// ============================================================
// ATELIER LA NONNA — Google Apps Script
// Sube facturas a Drive organizadas en carpetas "TX - AÑO"
//
// INSTRUCCIONES:
//   1. Abre script.google.com → Nuevo proyecto
//   2. Pega este código (reemplaza el contenido existente)
//   3. Cambia CARPETA_RAIZ_ID por el ID real de tu carpeta
//   4. Guarda (Ctrl+S)
//   5. Implementar → Nueva implementación → Aplicación web
//      · Ejecutar como: Yo
//      · Quién tiene acceso: Cualquiera
//   6. Copia la URL generada y pégala en App.jsx como APPS_SCRIPT_URL
// ============================================================

// ⬇️  CAMBIA ESTO: ID de tu carpeta raíz de Drive
// (la parte final de la URL: drive.google.com/drive/folders/ESTE_ID)
var CARPETA_RAIZ_ID = "1_-4IPitaopGpH6XCfcvOIhcB6c9V1cM5";

// ------------------------------------------------------------
function doPost(e) {
  try {
    var params   = e.parameter;
    var b64      = params.file;
    var nombre   = params.nombre   || ("factura_" + Date.now() + ".jpg");
    var mimeType = params.mimeType || "image/jpeg";
    var trimestre= params.trimestre|| "T1";
    var anyo     = params.anyo     || new Date().getFullYear().toString();
    var tipo     = params.tipo     || "gasto";

    // Estructura: Raíz / "T1 - 2025" / "Ingresos" o "Gastos"
    var nombreTrim   = trimestre + " - " + anyo;
    var nombreTipo   = (tipo === "ingreso") ? "Ingresos" : "Gastos";

    // Obtener (o crear) la carpeta raíz
    var raiz = DriveApp.getFolderById(CARPETA_RAIZ_ID);

    // Obtener (o crear) la carpeta del trimestre
    var carpetaTrim;
    var iterTrim = raiz.getFoldersByName(nombreTrim);
    if (iterTrim.hasNext()) {
      carpetaTrim = iterTrim.next();
    } else {
      carpetaTrim = raiz.createFolder(nombreTrim);
    }

    // Obtener (o crear) la subcarpeta Ingresos / Gastos
    var subcarpeta;
    var iterTipo = carpetaTrim.getFoldersByName(nombreTipo);
    if (iterTipo.hasNext()) {
      subcarpeta = iterTipo.next();
    } else {
      subcarpeta = carpetaTrim.createFolder(nombreTipo);
    }

    // Decodificar base64 y crear el archivo
    var bytes = Utilities.base64Decode(b64);
    var blob  = Utilities.newBlob(bytes, mimeType, nombre);
    var file  = subcarpeta.createFile(blob);

    // Hacer el archivo accesible por enlace
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Devolver la URL de visualización
    var fileUrl = "https://drive.google.com/file/d/" + file.getId() + "/view";

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, fileUrl: fileUrl }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET de prueba — abre la URL del script en el navegador para verificar que funciona
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", carpeta: CARPETA_RAIZ_ID }))
    .setMimeType(ContentService.MimeType.JSON);
}
