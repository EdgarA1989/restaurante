document.addEventListener("DOMContentLoaded", initApp);

let appConfig = {};
let menuPdfUrl = "";

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

// Las reservas ya no dependen de Sheets: salen por WhatsApp con datos de config.js.
function loadConfig() {
  appConfig = {
    reservas_activas: "SI",
    whatsapp: CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK,
  };
  toggleReservationForm(true);
  updateWhatsappLinks();
  setText("reservation-intro", "Completá tus datos y enviaremos la solicitud por WhatsApp con el mensaje ya armado.");
  setText("availability-status", "");
  return appConfig;
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

// Conecta el formulario con WhatsApp, sin guardar reservas en Sheets.
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

  form.addEventListener("submit", event => {
    event.preventDefault();
    syncTimeField(timeField, hourField, minuteField);
    if (!form.reportValidity()) return;

    const data = Object.fromEntries(new FormData(form).entries());
    window.open(buildWhatsappUrl(data), "_blank", "noopener");
    showReservationMessage("success", "Abrimos WhatsApp con tu solicitud de reserva lista para enviar.");
    setText("availability-status", "");
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
      setText("availability-status", "");
    });
  });
}

function syncTimeField(timeField, hourField, minuteField) {
  if (!timeField || !hourField || !minuteField) return;
  timeField.value = hourField.value && minuteField.value
    ? `${hourField.value}:${minuteField.value}`
    : "";
}

// Genera links de WhatsApp con texto prearmado.
function buildWhatsappUrl(data = "Hola, quiero hacer una reserva.") {
  const message = typeof data === "string"
    ? data
    : buildReservationMessage(data);
  const number = CONFIG.WHATSAPP || CONFIG.WHATSAPP_FALLBACK;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function buildReservationMessage(data) {
  const lines = [
    `Hola, quiero hacer una reserva en ${CONFIG.RESTAURANTE || "el restaurante"}.`,
    "",
    `Nombre: ${data.nombre || "-"}`,
    `Teléfono: ${data.telefono || "-"}`,
    `Fecha: ${formatDateForMessage(data.fecha_reserva)}`,
    `Hora: ${data.hora_reserva || "-"}`,
    `Personas: ${data.personas || "-"}`,
  ];

  const note = String(data.mensaje || "").trim();
  if (note) {
    lines.push(`Mensaje: ${note}`);
  }

  lines.push("", "Quedo atento/a a la confirmación. Gracias.");
  return lines.join("\n");
}

function formatDateForMessage(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
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
