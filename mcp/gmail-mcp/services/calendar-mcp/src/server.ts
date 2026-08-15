import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CalendarService } from "./calendar-service.js";

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  const candidate = error as { message?: unknown; response?: { status?: unknown; data?: { error?: { message?: unknown } } } };
  const detail = candidate.response?.data?.error?.message;
  const message = typeof detail === "string" ? detail : error instanceof Error ? error.message : String(error);
  const status = candidate.response?.status;
  return {
    isError: true,
    content: [{ type: "text" as const, text: typeof status === "number" ? `Calendar API error ${status}: ${message}` : message }],
  };
}

function safe<TArgs extends Record<string, unknown>>(handler: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try { return result(await handler(args)); } catch (error) { return failure(error); }
  };
}

const calendarId = z.string().min(1).default("primary");
const sendUpdates = z.enum(["all", "externalOnly", "none"]).default("none")
  .describe("Whether Google should send attendee notifications; defaults to none for safety");

export function createServer(calendar: CalendarService): McpServer {
  const server = new McpServer({ name: "calendar-mcp", version: "0.1.0" });

  server.registerTool("calendar_list_calendars", {
    title: "List Google Calendars",
    description: "List calendars available to the authorized account, including IDs and access roles.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(() => calendar.listCalendars()));

  server.registerTool("calendar_list_events", {
    title: "List Calendar Events",
    description: "List and search expanded event instances in chronological order.",
    inputSchema: {
      calendarId,
      timeMin: z.string().optional().describe("Inclusive RFC3339 lower bound"),
      timeMax: z.string().optional().describe("Exclusive RFC3339 upper bound"),
      query: z.string().optional().describe("Free-text event search"),
      maxResults: z.number().int().min(1).max(250).default(50),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe((args) => calendar.listEvents(args)));

  server.registerTool("calendar_get_event", {
    title: "Get Calendar Event",
    description: "Get one event by calendar ID and event ID.",
    inputSchema: { calendarId, eventId: z.string().min(1) },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe(({ calendarId, eventId }) => calendar.getEvent(calendarId, eventId)));

  server.registerTool("calendar_query_freebusy", {
    title: "Query Calendar Free/Busy",
    description: "Return busy intervals for up to 50 calendars within an RFC3339 time range.",
    inputSchema: {
      calendarIds: z.array(z.string().min(1)).min(1).max(50),
      timeMin: z.string(),
      timeMax: z.string(),
      timeZone: z.string().optional().describe("IANA time zone, e.g. Asia/Bangkok"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, safe((args) => calendar.queryFreeBusy(args)));

  server.registerTool("calendar_create_event", {
    title: "Create Calendar Event",
    description: "Create an event. Attendee notifications are disabled unless sendUpdates is explicitly changed.",
    inputSchema: {
      calendarId,
      summary: z.string().min(1),
      description: z.string().optional(),
      location: z.string().optional(),
      start: z.string().describe("RFC3339 date-time, or YYYY-MM-DD when allDay=true"),
      end: z.string().describe("Exclusive end; RFC3339 date-time, or YYYY-MM-DD when allDay=true"),
      allDay: z.boolean().default(false),
      timeZone: z.string().optional(),
      attendees: z.array(z.string().email()).optional(),
      recurrence: z.array(z.string()).optional().describe("RFC5545 rules such as RRULE:FREQ=WEEKLY;COUNT=4"),
      createGoogleMeet: z.boolean().default(false),
      sendUpdates,
    },
    annotations: { idempotentHint: false, openWorldHint: true },
  }, safe((args) => calendar.createEvent(args)));

  server.registerTool("calendar_update_event", {
    title: "Update Calendar Event",
    description: "Patch an event. Supply start and end together. Attendee notifications default to none.",
    inputSchema: {
      calendarId,
      eventId: z.string().min(1),
      summary: z.string().min(1).optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
      allDay: z.boolean().default(false),
      timeZone: z.string().optional(),
      attendees: z.array(z.string().email()).optional(),
      sendUpdates,
    },
    annotations: { idempotentHint: true, openWorldHint: true },
  }, safe((args) => calendar.updateEvent(args)));

  server.registerTool("calendar_delete_event", {
    title: "Delete Calendar Event",
    description: "Permanently delete an event. Attendee cancellation notifications default to none.",
    inputSchema: { calendarId, eventId: z.string().min(1), sendUpdates },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, safe(({ calendarId, eventId, sendUpdates }) => calendar.deleteEvent(calendarId, eventId, sendUpdates)));

  return server;
}
