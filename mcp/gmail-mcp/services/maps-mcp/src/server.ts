import { z } from "zod";
import { createMcpServer } from "@google-workspace/auth";
import type { MapsService } from "./maps-service.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: detail }] };
}

function safe<TArgs extends Record<string, unknown>>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  };
}

export function createServer(maps: MapsService) {
  const server = createMcpServer("maps-mcp", "0.1.0");

  server.registerTool("maps_geocode", {
    title: "Geocode address",
    description: "Convert an address to geographic coordinates (lat/lng).",
    inputSchema: {
      address: z.string().min(1).describe("Address to geocode"),
      language: z.string().optional(),
      region: z.string().optional().describe("Region bias, e.g. 'th'"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ address, language, region }) => maps.geocode(address, language, region)));

  server.registerTool("maps_reverse_geocode", {
    title: "Reverse geocode",
    description: "Convert coordinates (lat/lng) to a human-readable address.",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ lat, lng, language }) => maps.reverseGeocode(lat, lng, language)));

  server.registerTool("maps_search_places", {
    title: "Search places",
    description: "Search for places using a text query (e.g. 'coffee shops in Bangkok').",
    inputSchema: {
      query: z.string().min(1),
      language: z.string().optional(),
      region: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ query, language, region }) => maps.searchPlaces(query, language, region)));

  server.registerTool("maps_nearby_places", {
    title: "Nearby places",
    description: "Search for places near a location within a radius.",
    inputSchema: {
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusMeters: z.number().int().min(1).max(50000).default(1000),
      types: z.array(z.string()).optional().describe("Place types to filter, e.g. ['restaurant', 'cafe']"),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ lat, lng, radiusMeters, types, language }) => maps.nearbyPlaces(lat, lng, radiusMeters, types, language)));

  server.registerTool("maps_place_details", {
    title: "Place details",
    description: "Get detailed information about a place (rating, hours, reviews, phone).",
    inputSchema: {
      placeId: z.string().min(1),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ placeId, language }) => maps.placeDetails(placeId, language)));

  server.registerTool("maps_directions", {
    title: "Get directions",
    description: "Get directions between two locations (driving, walking, bicycling, transit).",
    inputSchema: {
      origin: z.string().min(1).describe("Origin address or 'lat,lng'"),
      destination: z.string().min(1).describe("Destination address or 'lat,lng'"),
      mode: z.enum(["driving", "walking", "bicycling", "transit"]).default("driving"),
      language: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ origin, destination, mode, language }) => maps.getDirections(origin, destination, mode, language)));

  return server;
}
