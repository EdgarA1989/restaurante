document.addEventListener("DOMContentLoaded", initApp);

let appConfig = {};
let menuPdfUrl = "";
let availabilityOk = false;

// Punto de entrada: prepara UI, datos remotos y eventos principales.
function initApp() {
  applyStaticConfig();
  initTheme();
  initMenu();
  initHomeLinks();
  initReveal();
  initGalleryLightbox();
  loadConfig();
  loadMenuPdf();
  setupReservationForm();
}

// Alterna modo oscuro/claro manteniendo la identidad visual de la plantilla.
function initTheme() {
  const toggle = document.getElementById("theme-toggle");
  const savedTheme = localStorage.getItem("urbano-theme") || "dark";

  applyTheme(savedTheme);

  toggle?.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("light") ? "dark" : "light";
    localStorage.setItem("urbano-theme", nextTheme);
    applyTheme(nextTheme);
  });

  function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light", isLight);
    toggle?.setAttribute("aria-pressed", String(isLight));
    toggle?.setAttribute("aria-label", isLight ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
  }
}

// Controla el menu mobile sin depender de librerias externas.
function initMenu() {
  const toggle = document.getElementById("menu-toggle");
  const panel = document.getElementById("nav-panel");
  if (!toggle || !panel) return;

  const closeMenu = () => {
    panel.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  panel.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
}

// Hace que logos e Inicio vuelvan arriba y cierren el menu mobile.
function initHomeLinks() {
  document.querySelectorAll('a[href="#inicio"]').forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      document.getElementById("nav-panel")?.classList.remove("is-open");
      document.getElementById("menu-toggle")?.setAttribute("aria-expanded", "false");
      history.replaceState(null, "", "#inicio");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// Pinta los datos base del restaurante desde config.js.
function applyStaticConfig() {
  document.title = `${CONFIG.RESTAURANTE} - Restaurante Urbano`;
  setText("restaurant-name", CONFIG.RESTAURANTE);
  setText("location-address", CONFIG.DIRECCION);
  setText("footer-address", CONFIG.DIRECCION);
  setText("reservation-hours", CONFIG.HORARIOS);
  setText("location-hours", CONFIG.HORARIOS);
  CONFIG.WHATSAPP = CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK;

  const mapsLink = document.getElementById("maps-link");
  if (mapsLink) mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONFIG.DIRECCION)}`;

  const instagram = document.getElementById("footer-instagram");
  if (instagram) instagram.href = CONFIG.INSTAGRAM;

  updateWhatsappLinks();
}

// Actualiza todos los enlaces de WhatsApp cuando cambia el numero desde Sheets.
function updateWhatsappLinks() {
  ["footer-whatsapp", "reservation-whatsapp", "disabled-whatsapp"].forEach(id => {
    const link = document.getElementById(id);
    if (link) link.href = buildWhatsappUrl("Hola, quiero hacer una consulta.");
  });
}

// Lee la hoja Configuracion y decide si mostrar formulario o aviso.
async function loadConfig() {
  const form = document.getElementById("reservation-form");
  const disabledBox = document.getElementById("disabled-reservations");

  if (!isAppsScriptConfigured()) {
    appConfig = {
      reservas_activas: "SI",
      mensaje_sin_disponibilidad: "Por el momento tomamos reservas por WhatsApp.",
      whatsapp: CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK,
    };
    toggleReservationForm(true);
    return appConfig;
  }

  try {
    const data = await fetchJson("config");
    appConfig = data.config || data || {};
    CONFIG.WHATSAPP = appConfig.whatsapp || CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK;
    updateWhatsappLinks();

    setText("restaurant-name", appConfig.nombre_restaurante || CONFIG.RESTAURANTE);
    setText("reservation-hours", appConfig.horario_reservas || CONFIG.HORARIOS);
    setText("location-address", appConfig.direccion || CONFIG.DIRECCION);
    setText("footer-address", appConfig.direccion || CONFIG.DIRECCION);
    setText("location-hours", appConfig.horario_reservas || CONFIG.HORARIOS);

    const mapsLink = document.getElementById("maps-link");
    if (mapsLink) {
      mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appConfig.direccion || CONFIG.DIRECCION)}`;
    }

    const instagram = document.getElementById("footer-instagram");
    if (instagram && appConfig.instagram) instagram.href = appConfig.instagram;

    const reservationsActive = normalizeYesNo(appConfig.reservas_activas) !== "NO";
    toggleReservationForm(reservationsActive);
    if (!reservationsActive) {
      setText("disabled-message", appConfig.mensaje_sin_disponibilidad || "Por el momento tomamos reservas por WhatsApp.");
      updateWhatsappLinks();
    }
  } catch (error) {
    console.warn("No se pudo cargar la configuración.", error);
    appConfig = {
      reservas_activas: "SI",
      whatsapp: CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK,
    };
    toggleReservationForm(true);
    setText("reservation-intro", "No pudimos cargar la configuración, pero podés completar la solicitud y también contactarnos por WhatsApp.");
    updateWhatsappLinks();
  }
}

// Busca el ultimo PDF publicado en Drive mediante Apps Script.
async function loadMenuPdf() {
  if (!isAppsScriptConfigured()) {
    renderMenuButton(null);
    return;
  }

  try {
    const data = await fetchJson("menu");
    renderMenuButton(data.ok ? data.menu : null);
  } catch (error) {
    console.warn("No se pudo cargar el menú.", error);
    renderMenuButton(null);
  }
}

// Activa o desactiva el boton de menu segun exista PDF disponible.
function renderMenuButton(menuData) {
  const button = document.getElementById("menu-button");
  const status = document.getElementById("menu-status");
  if (!button) return;

  menuPdfUrl = menuData?.viewUrl || "";

  if (!menuPdfUrl) {
    button.href = "#carta";
    button.setAttribute("aria-disabled", "true");
    button.classList.add("is-disabled");
    button.title = "El menú estará disponible próximamente.";
    if (status) status.textContent = "El menú estará disponible próximamente.";
    return;
  }

  button.href = menuPdfUrl;
  button.removeAttribute("aria-disabled");
  button.classList.remove("is-disabled");
  button.title = menuData.fileName ? `Abrir ${menuData.fileName}` : "Abrir menú actualizado";
  if (status) status.textContent = "";
}

// Conecta el formulario con validacion de disponibilidad y envio de reserva.
function setupReservationForm() {
  const form = document.getElementById("reservation-form");
  if (!form) return;

  const dateField = form.elements.fecha_reserva;
  const timeField = form.elements.hora_reserva;
  const hourField = document.getElementById("hora-reserva-hora");
  const minuteField = document.getElementById("hora-reserva-minutos");
  if (dateField) dateField.min = new Date().toISOString().slice(0, 10);
  setupTimePicker({ dateField, timeField, hourField, minuteField });

  document.getElementById("menu-button")?.addEventListener("click", event => {
    if (!menuPdfUrl) event.preventDefault();
  });

  [dateField, timeField].forEach(field => {
    field?.addEventListener("change", () => {
      if (dateField.value && timeField.value) {
        checkAvailability(dateField.value, timeField.value);
      }
    });
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const status = document.getElementById("reservation-status");

    if (!availabilityOk) {
      showReservationMessage("error", "Primero elegí una fecha y hora con disponibilidad.");
      return;
    }

    syncTimeField(timeField, hourField, minuteField);
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await submitReservation(data);
      form.reset();
      syncTimeField(timeField, hourField, minuteField);
      availabilityOk = false;
      showReservationMessage("success", "Tu solicitud de reserva fue enviada. Te confirmaremos por WhatsApp.");
      setText("availability-status", "");
    } catch (error) {
      console.warn("No se pudo enviar la reserva.", error);
      showReservationMessage("error", error.message || "No pudimos enviar la reserva. Podés contactarnos por WhatsApp.");
    }
  });
}

function setupTimePicker({ dateField, timeField, hourField, minuteField }) {
  if (!timeField || !hourField || !minuteField) return;
  if (!hourField.options.length) {
    hourField.appendChild(new Option("Hora", ""));
  }
  for (let hour = 9; hour <= 23; hour += 1) {
    const value = String(hour).padStart(2, "0");
    hourField.appendChild(new Option(value, value));
  }

  if (!minuteField.options.length) {
    minuteField.appendChild(new Option("Min", ""));
  }
  for (let minutes = 0; minutes < 60; minutes += 10) {
    const value = String(minutes).padStart(2, "0");
    minuteField.appendChild(new Option(value, value));
  }

  [hourField, minuteField].forEach(field => {
    field.addEventListener("change", () => {
      syncTimeField(timeField, hourField, minuteField);
      if (dateField.value && timeField.value) {
        checkAvailability(dateField.value, timeField.value);
      }
    });
  });
}

function syncTimeField(timeField, hourField, minuteField) {
  if (!timeField || !hourField || !minuteField) return;
  timeField.value = hourField.value && minuteField.value
    ? `${hourField.value}:${minuteField.value}`
    : "";
}

// Consulta la hoja Disponibilidad antes de permitir enviar la reserva.
async function checkAvailability(fecha, hora) {
  const status = document.getElementById("availability-status");
  const submit = document.getElementById("reservation-submit");
  availabilityOk = false;
  if (submit) submit.disabled = true;
  if (status) status.textContent = "Consultando disponibilidad...";

  if (!isAppsScriptConfigured()) {
    availabilityOk = true;
    if (submit) submit.disabled = false;
    if (status) status.textContent = "Modo demo: disponibilidad habilitada.";
    return true;
  }

  try {
    const data = await fetchJson("disponibilidad", { fecha, hora });
    availabilityOk = data.disponible === true || normalizeYesNo(data.disponible || data.available) === "SI";
    if (submit) submit.disabled = !availabilityOk;
    if (status) {
      status.textContent = availabilityOk
        ? "Hay disponibilidad para ese horario."
        : (data.motivo || "No hay disponibilidad para ese horario. Probá con otro horario o consultanos por WhatsApp.");
    }
    return availabilityOk;
  } catch (error) {
    console.warn("No se pudo consultar disponibilidad.", error);
    if (status) status.textContent = "No pudimos consultar disponibilidad. Contactanos por WhatsApp.";
    return false;
  }
}

// Guarda la reserva en la hoja Reservas usando POST hacia Apps Script.
async function submitReservation(data) {
  if (!isAppsScriptConfigured()) {
    return { ok: true, demo: true };
  }

  console.log("Reserva enviada a Apps Script:", data);
  const response = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=reserva`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(data),
  });

  const text = await response.text();
  console.log("Respuesta cruda Apps Script:", text);

  let result;
  try {
    result = JSON.parse(text);
  } catch (error) {
    console.error("No se pudo parsear la respuesta de Apps Script como JSON.", error);
    throw new Error(text || "Apps Script no devolvió una respuesta JSON válida.");
  }

  console.log("Respuesta parseada Apps Script:", result);
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || result.message || "No se pudo registrar la reserva.");
  }
  return result;
}

// Genera links de WhatsApp con texto prearmado.
function buildWhatsappUrl(data = "Hola, quiero hacer una reserva.") {
  const message = typeof data === "string"
    ? data
    : `Hola, quiero reservar una mesa para ${data.personas || ""} personas el ${data.fecha_reserva || ""} a las ${data.hora_reserva || ""}.`;
  const number = CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function showReservationMessage(type, message) {
  const status = document.getElementById("reservation-status");
  if (!status) return;

  status.className = `status-message form-wide status-message--${type}`;
  const whatsapp = buildWhatsappUrl("Hola, quiero reservar una mesa.");
  status.innerHTML = type === "error"
    ? `${message} <a href="${whatsapp}" target="_blank" rel="noreferrer">Escribir por WhatsApp</a>.`
    : message;
}

// Muestra u oculta el formulario segun la configuracion del cliente.
function toggleReservationForm(isActive) {
  const form = document.getElementById("reservation-form");
  const disabledBox = document.getElementById("disabled-reservations");
  if (form) form.hidden = !isActive;
  if (disabledBox) disabledBox.hidden = isActive;
}

// Helper unico para pedir JSON a Apps Script.
async function fetchJson(action, params = {}) {
  const url = new URL(CONFIG.APPS_SCRIPT_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error("La API no respondió correctamente.");
  return response.json();
}

// Permite que la plantilla funcione en modo demo sin Apps Script.
function isAppsScriptConfigured() {
  return CONFIG.APPS_SCRIPT_URL && !CONFIG.APPS_SCRIPT_URL.includes("PEGAR_URL");
}

// Normaliza campos SI/NO de la planilla.
function normalizeYesNo(value) {
  return String(value || "SI").trim().toUpperCase();
}

// Evita repetir chequeos de existencia para textos dinamicos.
function setText(id, value) {
  const element = document.getElementById(id);
  if (element && value) element.textContent = value;
}

// Revela secciones al entrar en pantalla.
function initReveal() {
  const sections = document.querySelectorAll(".section-reveal");
  if (!("IntersectionObserver" in window)) {
    sections.forEach(section => section.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: .12 });

  sections.forEach(section => observer.observe(section));
}

function initGalleryLightbox() {
  const lightbox = document.getElementById("gallery-lightbox");
  const lightboxImage = document.getElementById("gallery-lightbox-image");
  const caption = document.getElementById("gallery-lightbox-caption");
  const closeButton = lightbox?.querySelector(".gallery-lightbox__close");
  const prevButton = lightbox?.querySelector(".gallery-lightbox__control--prev");
  const nextButton = lightbox?.querySelector(".gallery-lightbox__control--next");
  const galleryImages = Array.from(document.querySelectorAll(".gallery img"));
  if (!lightbox || !lightboxImage || !caption || !galleryImages.length) return;
  let currentIndex = 0;

  const renderImage = index => {
    currentIndex = (index + galleryImages.length) % galleryImages.length;
    const image = galleryImages[currentIndex];
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Imagen de la galería";
    caption.textContent = image.alt || "";
  };

  const closeLightbox = ({ fromHistory = false } = {}) => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    lightboxImage.removeAttribute("src");
    lightboxImage.alt = "";
    caption.textContent = "";

    if (!fromHistory && history.state?.galleryLightbox) {
      history.back();
    }
  };

  const openLightbox = index => {
    const image = galleryImages[index];
    currentIndex = index;
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt || "Imagen de la galería";
    caption.textContent = image.alt || "";
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");

    if (!history.state?.galleryLightbox) {
      history.pushState({ galleryLightbox: true }, "", "#galeria-imagen");
    }
  };

  const showPrevious = () => renderImage(currentIndex - 1);
  const showNext = () => renderImage(currentIndex + 1);

  galleryImages.forEach((image, index) => {
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", `Ampliar ${image.alt || "imagen de la galería"}`);
    image.addEventListener("click", () => openLightbox(index));
    image.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(index);
      }
    });
  });

  closeButton?.addEventListener("click", () => closeLightbox());
  prevButton?.addEventListener("click", showPrevious);
  nextButton?.addEventListener("click", showNext);
  lightbox.addEventListener("click", event => {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeLightbox();
    if (lightbox.hidden) return;
    if (event.key === "ArrowLeft") showPrevious();
    if (event.key === "ArrowRight") showNext();
  });
  window.addEventListener("popstate", () => {
    if (!lightbox.hidden) closeLightbox({ fromHistory: true });
  });
}
