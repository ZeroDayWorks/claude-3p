import { describe, expect, it, vi } from "vitest";
import type { calendar_v3 } from "googleapis";
import { CalendarService } from "./calendar-service.js";

describe("CalendarService", () => {
  it("creates events without notifications by default", async () => {
    const insert = vi.fn().mockResolvedValue({ data: {
      id: "event-1", summary: "Planning", start: { dateTime: "2026-07-20T09:00:00+07:00" },
      end: { dateTime: "2026-07-20T10:00:00+07:00" },
    } });
    const api = { events: { insert } } as unknown as calendar_v3.Calendar;
    const service = new CalendarService(api);
    await service.createEvent({
      summary: "Planning", start: "2026-07-20T09:00:00+07:00", end: "2026-07-20T10:00:00+07:00",
      attendees: ["alice@example.com"],
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: "primary", sendUpdates: "none",
      requestBody: expect.objectContaining({ attendees: [{ email: "alice@example.com" }] }),
    }));
  });

  it("rejects reversed event intervals", async () => {
    const service = new CalendarService({ events: {} } as unknown as calendar_v3.Calendar);
    await expect(service.createEvent({
      summary: "Invalid", start: "2026-07-20T10:00:00+07:00", end: "2026-07-20T09:00:00+07:00",
    })).rejects.toThrow("Event end must be later");
  });

  it("rejects invalid all-day dates", async () => {
    const service = new CalendarService({ events: {} } as unknown as calendar_v3.Calendar);
    await expect(service.createEvent({
      summary: "Invalid", start: "2026-02-30", end: "2026-03-02", allDay: true,
    })).rejects.toThrow("valid YYYY-MM-DD");
  });
});
