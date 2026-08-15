const BASE_URL = "https://maps.googleapis.com";
const PLACES_BASE_URL = "https://places.googleapis.com";

export class MapsService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Maps API error ${response.status}: ${body}`);
    }
    return response.json() as Promise<T>;
  }

  async geocode(address: string, language?: string, region?: string) {
    const params = new URLSearchParams({ address, key: this.apiKey });
    if (language) params.set("language", language);
    if (region) params.set("region", region);
    const data = await this.fetchJson<{ status: string; results: unknown[] }>(`${BASE_URL}/maps/api/geocode/json?${params}`);
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Geocoding failed: ${data.status}`);
    return data.results;
  }

  async reverseGeocode(lat: number, lng: number, language?: string) {
    const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: this.apiKey });
    if (language) params.set("language", language);
    const data = await this.fetchJson<{ status: string; results: unknown[] }>(`${BASE_URL}/maps/api/geocode/json?${params}`);
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Reverse geocoding failed: ${data.status}`);
    return data.results;
  }

  async searchPlaces(query: string, language?: string, region?: string) {
    const body: Record<string, unknown> = { textQuery: query };
    if (language) body.languageCode = language;
    if (region) body.regionCode = region;
    const data = await this.fetchJson<{ places: unknown[] }>(`${PLACES_BASE_URL}/v1/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.googleMapsUri,places.primaryType" },
      body: JSON.stringify(body),
    });
    return data.places;
  }

  async nearbyPlaces(lat: number, lng: number, radiusMeters = 1000, types?: string[], language?: string) {
    const body: Record<string, unknown> = {
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
    };
    if (types?.length) body.includedTypes = types;
    if (language) body.languageCode = language;
    const data = await this.fetchJson<{ places: unknown[] }>(`${PLACES_BASE_URL}/v1/places:searchNearby`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryType" },
      body: JSON.stringify(body),
    });
    return data.places;
  }

  async placeDetails(placeId: string, language?: string) {
    const params = new URLSearchParams({ key: this.apiKey, place_id: placeId });
    if (language) params.set("language", language);
    const data = await this.fetchJson<{ status: string; result: unknown }>(`${BASE_URL}/maps/api/place/details/json?${params}`);
    if (data.status !== "OK") throw new Error(`Place details failed: ${data.status}`);
    return data.result;
  }

  async getDirections(origin: string, destination: string, mode: "driving" | "walking" | "bicycling" | "transit" = "driving", language?: string) {
    const params = new URLSearchParams({ origin, destination, mode, key: this.apiKey });
    if (language) params.set("language", language);
    const data = await this.fetchJson<{ status: string; routes: unknown[] }>(`${BASE_URL}/maps/api/directions/json?${params}`);
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") throw new Error(`Directions failed: ${data.status}`);
    return data.routes;
  }
}
