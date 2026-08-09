import { IntegrationService, ToolCall, ToolResult } from "./integration";

export class CalendarService {
  constructor(private integration: IntegrationService) {}

  /**
   * Fetch upcoming calendar events for the user.
   * By default, it fetches events starting from now.
   */
  async getUpcomingEvents(
    tenantId: string,
    timeMin: string = new Date().toISOString(),
    maxResults: number = 10,
  ): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "googlecalendar",
      action: "api.events.getMany",
      args: {
        timeMin,
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      },
    };

    return this.integration.executeTool(tenantId, call);
  }
  /**
   * Check availability for a list of emails between two times.
   */
  async checkAvailability(
    tenantId: string,
    timeMin: string,
    timeMax: string,
    emails: string[],
  ): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "googlecalendar",
      action: "api.calendar.getAvailability",
      args: {
        timeMin,
        timeMax,
        items: emails.map((email) => ({ id: email })),
      },
    };

    return this.integration.executeTool(tenantId, call);
  }
  /**
   * Create a new calendar event.
   */
  async createEvent(
    tenantId: string,
    summary: string,
    start: string,
    end: string,
    attendees: string[],
  ): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "googlecalendar",
      action: "api.events.create",
      args: {
        event: {
          summary,
          start: { dateTime: start },
          end: { dateTime: end },
          attendees: attendees.map((email) => ({ email })),
        },
      },
    };

    return this.integration.executeTool(tenantId, call);
  }

  /**
   * Modify a calendar event.
   * Google Calendar's update requires the full object, so we fetch it first, apply changes, and update.
   */
  async modifyEvent(
    tenantId: string,
    eventId: string,
    changes: Record<string, any>,
  ): Promise<ToolResult> {
    const getCall: ToolCall = {
      plugin: "googlecalendar",
      action: "api.events.get",
      args: { id: eventId },
    };

    const getResult = await this.integration.executeTool(tenantId, getCall);
    if (getResult.error || !getResult.data) {
      return getResult;
    }

    const updatedEvent = {
      ...getResult.data,
      ...changes,
    };

    const updateCall: ToolCall = {
      plugin: "googlecalendar",
      action: "api.events.update",
      args: {
        id: eventId,
        event: updatedEvent,
      },
    };

    return this.integration.executeTool(tenantId, updateCall);
  }
}
