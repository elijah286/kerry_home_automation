// ---------------------------------------------------------------------------
// National Weather Service API client
// https://www.weather.gov/documentation/services-web-api
// ---------------------------------------------------------------------------

import { logger } from '../../logger.js';

const BASE_URL = 'https://api.weather.gov';
const USER_AGENT = 'KerryHomeAutomation/3.0 (github.com/elijah286)';

interface NWSPointsMeta {
  forecastUrl: string;
  forecastHourlyUrl: string;
  observationStationsUrl: string;
  gridId: string;
  gridX: number;
  gridY: number;
}

export interface NWSObservation {
  temperature: { value: number | null; unitCode: string };
  relativeHumidity: { value: number | null };
  windSpeed: { value: number | null; unitCode: string };
  windDirection: { value: number | null };
  textDescription: string;
  icon: string | null;
  timestamp: string;
}

export interface NWSForecastPeriod {
  number: number;
  name: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  icon: string;
}

async function nwsFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json',
    },
  });
  if (!res.ok) {
    throw new Error(`NWS API ${res.status}: ${res.statusText} for ${url}`);
  }
  return res.json();
}

export class NWSClient {
  private pointsMeta: NWSPointsMeta | null = null;
  private nearestStation: string | null = null;

  constructor(
    private lat: number,
    private lon: number,
  ) {}

  /** Resolve grid metadata for this lat/lon (cached after first call) */
  async resolvePoint(): Promise<NWSPointsMeta> {
    if (this.pointsMeta) return this.pointsMeta;

    const data = (await nwsFetch(`${BASE_URL}/points/${this.lat},${this.lon}`)) as {
      properties: {
        forecast: string;
        forecastHourly: string;
        observationStations: string;
        gridId: string;
        gridX: number;
        gridY: number;
      };
    };

    this.pointsMeta = {
      forecastUrl: data.properties.forecast,
      forecastHourlyUrl: data.properties.forecastHourly,
      observationStationsUrl: data.properties.observationStations,
      gridId: data.properties.gridId,
      gridX: data.properties.gridX,
      gridY: data.properties.gridY,
    };

    logger.info(
      { gridId: this.pointsMeta.gridId, gridX: this.pointsMeta.gridX, gridY: this.pointsMeta.gridY },
      'NWS: resolved grid point',
    );

    return this.pointsMeta;
  }

  /** Get nearest observation station ID */
  async getNearestStation(): Promise<string> {
    if (this.nearestStation) return this.nearestStation;

    const meta = await this.resolvePoint();
    const data = (await nwsFetch(meta.observationStationsUrl)) as {
      features: { properties: { stationIdentifier: string } }[];
    };

    if (!data.features.length) throw new Error('NWS: no observation stations found');
    this.nearestStation = data.features[0].properties.stationIdentifier;
    logger.info({ station: this.nearestStation }, 'NWS: using nearest station');
    return this.nearestStation;
  }

  /** Get current conditions from nearest station */
  async getCurrentConditions(): Promise<NWSObservation> {
    const station = await this.getNearestStation();
    const data = (await nwsFetch(`${BASE_URL}/stations/${station}/observations/latest`)) as {
      properties: {
        temperature: { value: number | null; unitCode: string };
        relativeHumidity: { value: number | null };
        windSpeed: { value: number | null; unitCode: string };
        windDirection: { value: number | null };
        textDescription: string;
        icon: string | null;
        timestamp: string;
      };
    };

    return data.properties;
  }

  /** Get 7-day forecast periods */
  async getForecast(): Promise<NWSForecastPeriod[]> {
    const meta = await this.resolvePoint();
    const data = (await nwsFetch(meta.forecastUrl)) as {
      properties: { periods: NWSForecastPeriod[] };
    };
    return data.properties.periods;
  }
}
