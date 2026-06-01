export const GA_MEASUREMENT_ID = '';

let initialized = false;
let enabled = false;

function hasMeasurementId() {
  return /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID.trim());
}

export function initAnalytics() {
  if (initialized) return enabled;
  initialized = true;

  if (!hasMeasurementId() || window.location.protocol === 'file:') return false;

  const id = GA_MEASUREMENT_ID.trim();
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', id, {
    send_page_view: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  enabled = true;
  return true;
}

export function trackEvent(name, params = {}) {
  if (!enabled || typeof window.gtag !== 'function') return;

  const safeParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value)) safeParams[key] = value;
    else if (typeof value === 'boolean') safeParams[key] = value ? 'true' : 'false';
    else if (typeof value === 'string') safeParams[key] = value.slice(0, 100);
  }

  window.gtag('event', name, safeParams);
}
