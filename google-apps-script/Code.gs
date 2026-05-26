/**
 * Restaurante Urbano - API publica para menu PDF y reservas.
 *
 * Publicar como Web App:
 * - Ejecutar como: Yo
 * - Acceso: Cualquiera
 */

const ROOT_FOLDER_ID = "1fRGB-m3Ve6NzqjbXGJj62eBn5G1iJJBb";
const MENU_FOLDER_ID = "1WpurpVz29fvhXmBStsrTMPVEmz798bvU";
const SPREADSHEET_ID = "1JVlaOGF6-yHdiIQqJaaaWcMAjWBmnxcUUdmzCY_HTEk";

const SHEET_RESERVAS = "Reservas";
const SHEET_CONFIG = "Configuracion";
const SHEET_DISPONIBILIDAD = "Disponibilidad";
const ESTADO_INICIAL = "Pendiente";

function doGet(e) {
  try {
    const action = normalizeText(e && e.parameter && e.parameter.action);

    if (action === "config") {
      return jsonResponse({ ok: true, config: getConfig() });
    }

    if (action === "menu") {
      const menu = getLatestMenuPdf();
      if (!menu) {
        return jsonResponse({ ok: false, message: "No hay menú PDF disponible." });
      }
      return jsonResponse({ ok: true, menu });
    }

    if (action === "disponibilidad") {
      const fecha = e.parameter.fecha;
      const hora = e.parameter.hora;
      return jsonResponse(checkAvailability(fecha, hora));
    }

    return jsonResponse({ ok: false, error: "Acción no válida." });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Error inesperado." });
  }
}

function doPost(e) {
  try {
    const action = normalizeText(e && e.parameter && e.parameter.action);

    if (action !== "reserva") {
      return jsonResponse({ ok: false, error: "Acción no válida." });
    }

    const data = parsePostData(e);
    const result = saveReservation(data);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "No se pudo registrar la reserva." });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfig() {
  const sheet = getSheet(SHEET_CONFIG);
  const values = sheet.getDataRange().getDisplayValues();
  const config = {};

  values.slice(1).forEach(row => {
    const campo = normalizeText(row[0]);
    if (!campo) return;
    config[campo] = String(row[1] || "").trim();
  });

  return config;
}

function getLatestMenuPdf() {
  const folder = DriveApp.getFolderById(MENU_FOLDER_ID);
  const files = folder.getFiles();
  let latestFile = null;
  let latestDate = null;

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.PDF) continue;

    const updatedAt = file.getLastUpdated() || file.getDateCreated();
    if (!latestFile || updatedAt.getTime() > latestDate.getTime()) {
      latestFile = file;
      latestDate = updatedAt;
    }
  }

  if (!latestFile) return null;

  latestFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = latestFile.getId();
  return {
    fileName: latestFile.getName(),
    fileId,
    viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
    updatedAt: latestDate.toISOString(),
  };
}

function checkAvailability(fecha, hora) {
  if (!fecha || !hora) {
    return { ok: false, disponible: false, motivo: "Fecha y hora son obligatorias." };
  }

  const rowInfo = findAvailabilityRow(fecha, hora);
  if (!rowInfo) {
    return { ok: true, disponible: false, motivo: "Horario no configurado" };
  }

  const disponible = normalizeYesNo(rowInfo.data.disponible) === "SI";
  return {
    ok: true,
    disponible,
    motivo: disponible ? "" : "Sin disponibilidad",
    disponibilidad: rowInfo.data,
  };
}

function saveReservation(data) {
  const required = ["nombre", "telefono", "fecha_reserva", "hora_reserva", "personas"];
  required.forEach(field => {
    if (!String(data[field] || "").trim()) {
      throw new Error(`El campo ${field} es obligatorio.`);
    }
  });

  const config = getConfig();
  if (normalizeYesNo(config.reservas_activas || "SI") === "NO") {
    throw new Error(config.mensaje_sin_disponibilidad || "Las reservas no están activas.");
  }

  const availability = checkAvailability(data.fecha_reserva, data.hora_reserva);
  if (!availability.disponible) {
    throw new Error(availability.motivo || "No hay disponibilidad para ese horario.");
  }

  const sheet = getSheet(SHEET_RESERVAS);
  sheet.appendRow([
    new Date(),
    String(data.nombre || "").trim(),
    String(data.telefono || "").trim(),
    String(data.fecha_reserva || "").trim(),
    String(data.hora_reserva || "").trim(),
    Number(data.personas) || 0,
    String(data.mensaje || "").trim(),
    ESTADO_INICIAL,
  ]);

  updateAvailability(data.fecha_reserva, data.hora_reserva, data.personas);

  return {
    ok: true,
    message: "Reserva registrada correctamente.",
    estado: ESTADO_INICIAL,
  };
}

function updateAvailability(fecha, hora, personas) {
  const rowInfo = findAvailabilityRow(fecha, hora);
  if (!rowInfo) return { ok: false, motivo: "Horario no configurado" };

  const sheet = getSheet(SHEET_DISPONIBILIDAD);
  const headers = rowInfo.headers;
  const rowNumber = rowInfo.rowNumber;
  const cupoMaximo = Number(rowInfo.data.cupo_maximo) || 0;
  const reservasTomadas = Number(rowInfo.data.reservas_tomadas) || 0;
  const nuevasReservas = reservasTomadas + (Number(personas) || 0);
  const disponible = cupoMaximo > 0 && nuevasReservas >= cupoMaximo ? "NO" : "SI";

  const reservasIndex = headers.indexOf("reservas_tomadas");
  const disponibleIndex = headers.indexOf("disponible");

  if (reservasIndex >= 0) {
    sheet.getRange(rowNumber, reservasIndex + 1).setValue(nuevasReservas);
  }

  if (disponibleIndex >= 0) {
    sheet.getRange(rowNumber, disponibleIndex + 1).setValue(disponible);
  }

  return { ok: true, reservas_tomadas: nuevasReservas, disponible };
}

function getSheet(name) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error(`No existe la hoja "${name}".`);
  return sheet;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePostData(e) {
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : "";
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("El cuerpo del pedido no tiene un JSON válido.");
  }
}

function findAvailabilityRow(fecha, hora) {
  const sheet = getSheet(SHEET_DISPONIBILIDAD);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(normalizeText);
  const fechaIndex = headers.indexOf("fecha");
  const horaIndex = headers.indexOf("hora");
  if (fechaIndex < 0 || horaIndex < 0) {
    throw new Error('La hoja "Disponibilidad" debe tener columnas fecha y hora.');
  }

  for (let index = 1; index < values.length; index += 1) {
    const row = values[index];
    const rowFecha = normalizeDateCell(row[fechaIndex]);
    const rowHora = normalizeTimeCell(row[horaIndex]);

    if (rowFecha === fecha && rowHora === hora) {
      const data = {};
      headers.forEach((header, headerIndex) => {
        data[header] = normalizeCellValue(row[headerIndex], header);
      });
      return { rowNumber: index + 1, headers, data };
    }
  }

  return null;
}

function normalizeDateCell(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").trim();
}

function normalizeTimeCell(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }
  return String(value || "").trim().slice(0, 5);
}

function normalizeCellValue(value, header) {
  if (header === "fecha") return normalizeDateCell(value);
  if (header === "hora") return normalizeTimeCell(value);
  return String(value || "").trim();
}

function normalizeYesNo(value) {
  const text = String(value || "").trim().toUpperCase();
  return text === "SI" || text === "SÍ" || text === "YES" || text === "TRUE" ? "SI" : "NO";
}
