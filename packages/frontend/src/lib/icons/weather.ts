// ---------------------------------------------------------------------------
// NWS short-forecast text → icon glyph name.
//
// The National Weather Service returns both a colour-bitmap icon URL and a
// short-forecast text ("Mostly Sunny", "Slight Chance Showers", …). We
// previously embedded the bitmap; users pointed out it breaks the consistent
// outline-glyph visual language. This module maps the text to a lucide
// outline icon so every card in the app uses the same stroke language.
//
// Matching is keyword-based and case-insensitive. Check order matters: the
// first rule that matches wins, so put more-specific terms above more-general
// ones (e.g. "thunderstorm" before "storm", "partly cloudy" before "cloudy").
// ---------------------------------------------------------------------------

export interface WeatherIconMatch {
  /** Substring to match (lowercased) against the NWS short-forecast text. */
  keywords: RegExp;
  /** Day-variant icon name (used when isDaytime === true). */
  day: string;
  /** Night-variant icon name (used when isDaytime === false). Falls back
   *  to `day` when omitted. */
  night?: string;
}

export const WEATHER_ICON_RULES: WeatherIconMatch[] = [
  // Most specific first
  { keywords: /tornado|funnel/i,                day: 'Tornado' },
  { keywords: /hurricane/i,                     day: 'Tornado' },
  { keywords: /blizzard|heavy snow/i,           day: 'Snowflake' },
  { keywords: /freezing rain|sleet|ice/i,       day: 'CloudHail' },
  { keywords: /hail/i,                          day: 'CloudHail' },
  { keywords: /thunderstorm|thunder/i,          day: 'CloudLightning' },
  { keywords: /snow/i,                          day: 'CloudSnow' },
  { keywords: /rain.*wind|wind.*rain/i,         day: 'CloudRainWind' },
  { keywords: /shower|drizzle|rain/i,           day: 'CloudRain' },
  { keywords: /fog|mist/i,                      day: 'CloudFog' },
  { keywords: /haze|smoke|dust/i,               day: 'Haze' },
  { keywords: /windy|wind/i,                    day: 'Wind' },
  { keywords: /partly (sunny|cloudy)|mostly cloudy/i, day: 'CloudSun',  night: 'CloudMoon' },
  { keywords: /mostly sunny|mostly clear/i,     day: 'Sun',       night: 'Moon' },
  { keywords: /overcast|cloudy/i,               day: 'Cloud' },
  { keywords: /clear|fair|sunny/i,              day: 'Sun',       night: 'Moon' },
];

/** Default when nothing matches — a neutral glyph instead of a thermometer so
 *  the card still communicates "weather" rather than "temperature sensor". */
export const DEFAULT_WEATHER_ICON = 'CloudSun';

/** Resolve a glyph name for an NWS period. */
export function weatherIconFor(shortForecast: string | null | undefined, isDaytime: boolean): string {
  const text = shortForecast ?? '';
  for (const rule of WEATHER_ICON_RULES) {
    if (rule.keywords.test(text)) {
      return isDaytime ? rule.day : (rule.night ?? rule.day);
    }
  }
  return DEFAULT_WEATHER_ICON;
}
