import { randomUUID } from "node:crypto";
import { google, type Auth, type calendar_v3 } from "googleapis";

export type SendUpdates = "all" | "externalOnly" | "none";

export interface EventTimeInput {
  start: string;
  end: string;
  allDay?: boolean;
  timeZone?: string;
}

export interface CreateEventInput extends EventTimeInput {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  attendees?: string[];
  recurrence?: string[];
  createGoogleMeet?: boolean;
  sendUpdates?: SendUpdates;
}

function eventTime(value: string, allDay: boolean, timeZone?: string): calendar_v3.Schema$EventDateTime {
  if (allDay) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error("All-day event times must use a valid YYYY-MM-DD date");
    }
    return { date: value };
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Timed event values must be valid RFC3339 date-times");
  }
  return { dateTime: value, ...(timeZone ? { timeZone } : {}) };
}

function eventInterval(input: EventTimeInput): Pick<calendar_v3.Schema$Event, "start" | "end"> {
  const allDay = input.allDay ?? false;
  const startValue = allDay ? input.start : Date.parse(input.start);
  const endValue = allDay ? input.end : Date.parse(input.end);
  if (startValue >= endValue) throw new Error("Event end must be later than event start");
  return {
    start: eventTime(input.start, allDay, input.timeZone),
    end: eventTime(input.end, allDay, input.timeZone),
  };
}

function compactEvent(event: calendar_v3.Schema$Event) {
  return {
    id: event.id,
    status: event.status,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    attendees: event.attendees,
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId,
    organizer: event.organizer,
    htmlLink: event.htmlLink,
    hangoutLink: event.hangoutLink,
    updated: event.updated,
  };
}

export class CalendarService {
  constructor(private readonly calendar: calendar_v3.Calendar) {}

  static fromAuth(auth: Auth.OAuth2Client): CalendarService {
    return new CalendarService(google.calendar({ version: "v3", auth }));
  }

  async listCalendars() {
    const response = await this.calendar.calendarList.list({ maxResults: 250 });
    return (response.data.items ?? []).map((item) => ({
      id: item.id, summary: item.summary, description: item.description,
      primary: item.primary ?? false, accessRole: item.accessRole, timeZone: item.timeZone,
    }));
  }

  async listEvents(input: {
    calendarId?: string; timeMin?: string; timeMax?: string; query?: string;
    maxResults?: number; pageToken?: string;
  }) {
    const timeMin = input.timeMin ? Date.parse(input.timeMin) : undefined;
    const timeMax = input.timeMax ? Date.parse(input.timeMax) : undefined;
    if (timeMin != null && Number.isNaN(timeMin)) throw new Error("timeMin must be a valid RFC3339 date-time");
    if (timeMax != null && Number.isNaN(timeMax)) throw new Error("timeMax must be a valid RFC3339 date-time");
    if (timeMin != null && timeMax != null && timeMin >= timeMax) throw new Error("timeMax must be later than timeMin");
    const response = await this.calendar.events.list({
      calendarId: input.calendarId ?? "primary",
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      q: input.query,
      maxResults: input.maxResults ?? 50,
      pageToken: input.pageToken,
      singleEvents: true,
      orderBy: "startTime",
    });
    return {
      events: (response.data.items ?? []).map(compactEvent),
      nextPageToken: response.data.nextPageToken ?? undefined,
      timeZone: response.data.timeZone ?? undefined,
    };
  }

  async getEvent(calendarId: string, eventId: string) {
    const response = await this.calendar.events.get({ calendarId, eventId });
    return compactEvent(response.data);
  }

  async queryFreeBusy(input: { calendarIds: string[]; timeMin: string; timeMax: string; timeZone?: string }) {
    const timeMin = Date.parse(input.timeMin);
    const timeMax = Date.parse(input.timeMax);
    if (Number.isNaN(timeMin) || Number.isNaN(timeMax)) throw new Error("Free/busy bounds must be valid RFC3339 date-times");
    if (timeMin >= timeMax) throw new Error("timeMax must be later than timeMin");
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: input.timeMin, timeMax: input.timeMax, timeZone: input.timeZone,
        items: input.calendarIds.map((id) => ({ id })),
      },
    });
    return response.data;
  }

  async createEvent(input: CreateEventInput) {
    const interval = eventInterval(input);
    const requestBody: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      attendees: input.attendees?.map((email) => ({ email })),
      recurrence: input.recurrence,
      ...interval,
      ...(input.createGoogleMeet ? {
        conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      } : {}),
    };
    const response = await this.calendar.events.insert({
      calendarId: input.calendarId ?? "primary",
      sendUpdates: input.sendUpdates ?? "none",
      conferenceDataVersion: input.createGoogleMeet ? 1 : 0,
      requestBody,
    });
    return compactEvent(response.data);
  }

  async updateEvent(input: {
    calendarId?: string; eventId: string; summary?: string; description?: string; location?: string;
    attendees?: string[]; start?: string; end?: string; allDay?: boolean; timeZone?: string; sendUpdates?: SendUpdates;
  }) {
    if ((input.start == null) !== (input.end == null)) throw new Error("start and end must be supplied together");
    const interval = input.start && input.end ? eventInterval({
      start: input.start, end: input.end, allDay: input.allDay, timeZone: input.timeZone,
    }) : {};
    const response = await this.calendar.events.patch({
      calendarId: input.calendarId ?? "primary",
      eventId: input.eventId,
      sendUpdates: input.sendUpdates ?? "none",
      requestBody: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        attendees: input.attendees?.map((email) => ({ email })),
        ...interval,
      },
    });
    return compactEvent(response.data);
  }

  async deleteEvent(calendarId: string, eventId: string, sendUpdates: SendUpdates) {
    await this.calendar.events.delete({ calendarId, eventId, sendUpdates });
    return { deleted: true, calendarId, eventId, sendUpdates };
  }
}
