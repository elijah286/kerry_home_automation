const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Compute solar elevation angle in degrees for a given position and time.
 * Adapted from NOAA solar calculator equations.
 */
export function getSolarElevation(lat: number, lon: number, date: Date): number {
  const jd = toJulianDate(date);
  const jc = (jd - 2451545) / 36525;

  const geomMeanLongSun = (280.46646 + jc * (36000.76983 + 0.0003032 * jc)) % 360;
  const geomMeanAnomSun = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const eccentEarthOrbit = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);

  const sunEqOfCenter =
    Math.sin(geomMeanAnomSun * DEG) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * geomMeanAnomSun * DEG) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * geomMeanAnomSun * DEG) * 0.000289;

  const sunTrueLong = geomMeanLongSun + sunEqOfCenter;
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * jc) * DEG);

  const meanObliqEcliptic = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos((125.04 - 1934.136 * jc) * DEG);

  const sunDeclin = Math.asin(Math.sin(obliqCorr * DEG) * Math.sin(sunAppLong * DEG)) * RAD;

  const varY = Math.tan((obliqCorr / 2) * DEG) ** 2;
  const eqOfTime =
    4 *
    RAD *
    (varY * Math.sin(2 * geomMeanLongSun * DEG) -
      2 * eccentEarthOrbit * Math.sin(geomMeanAnomSun * DEG) +
      4 * eccentEarthOrbit * varY * Math.sin(geomMeanAnomSun * DEG) * Math.cos(2 * geomMeanLongSun * DEG) -
      0.5 * varY * varY * Math.sin(4 * geomMeanLongSun * DEG) -
      1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * geomMeanAnomSun * DEG));

  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const trueSolarTime = ((utcHours / 24) * 1440 + eqOfTime + 4 * lon) % 1440;

  let hourAngle: number;
  if (trueSolarTime / 4 < 0) {
    hourAngle = trueSolarTime / 4 + 180;
  } else {
    hourAngle = trueSolarTime / 4 - 180;
  }

  const solarZenith =
    Math.acos(
      Math.sin(lat * DEG) * Math.sin(sunDeclin * DEG) +
        Math.cos(lat * DEG) * Math.cos(sunDeclin * DEG) * Math.cos(hourAngle * DEG),
    ) * RAD;

  return 90 - solarZenith;
}

function toJulianDate(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

  let jy = y;
  let jm = m;
  if (m <= 2) {
    jy -= 1;
    jm += 12;
  }
  const A = Math.floor(jy / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (jy + 4716)) + Math.floor(30.6001 * (jm + 1)) + d + h / 24 + B - 1524.5;
}
