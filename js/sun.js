// Solar position for the site, NOAA algorithm (Meeus, low precision: good to about 0.01 deg).
// Site: 25.28 N, 55.88 E. Clock: Gulf Standard Time, UTC+4. Day: 17 November, clear sky.
export const SITE_LAT = 25.28, SITE_LON = 55.88, TZ = 4;
export const DAY = { y: 2026, m: 11, d: 17 };

const R = Math.PI / 180;

function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

// hours: local clock time (decimal hours, UTC+4). Returns azimuth (deg clockwise from true north) and elevation (deg).
export function sunAt(hours) {
  const jd = julianDay(DAY.y, DAY.m, DAY.d) + (hours - TZ) / 24;
  const T = (jd - 2451545.0) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * R) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
            Math.sin(2 * M * R) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * R) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * R);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * R);
  const decl = Math.asin(Math.sin(eps * R) * Math.sin(lambda * R)) / R;
  const y = Math.tan(eps * R / 2) ** 2;
  const eqTime = 4 / R * (y * Math.sin(2 * L0 * R) - 2 * e * Math.sin(M * R) + 4 * e * y * Math.sin(M * R) * Math.cos(2 * L0 * R)
    - 0.5 * y * y * Math.sin(4 * L0 * R) - 1.25 * e * e * Math.sin(2 * M * R));
  const tst = (hours * 60 + eqTime + 4 * SITE_LON - 60 * TZ + 1440) % 1440;   // true solar time, minutes
  const ha = tst / 4 - 180;                                                   // hour angle, deg
  const cosZ = Math.sin(SITE_LAT * R) * Math.sin(decl * R) + Math.cos(SITE_LAT * R) * Math.cos(decl * R) * Math.cos(ha * R);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZ))) / R;
  let az = Math.acos(Math.min(1, Math.max(-1,
    (Math.sin(SITE_LAT * R) * cosZ - Math.sin(decl * R)) / (Math.cos(SITE_LAT * R) * Math.sin(zen * R))))) / R;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { az, el: 90 - zen, decl, eqTime };
}

// Unit vector toward the sun in scene axes: +X east, +Y up, -Z north (three.js, glTF Y-up of the plan: plan +Y is true north).
export function sunVector(azDeg, elDeg, out) {
  const a = azDeg * R, e = elDeg * R, c = Math.cos(e);
  out.set(Math.sin(a) * c, Math.sin(e), -Math.cos(a) * c);
  return out;
}

export function clockText(hours) {
  const h = Math.floor(hours), m = Math.floor((hours - h) * 60 + 1e-6);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
