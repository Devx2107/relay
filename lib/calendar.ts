import { IntegrationService, ToolCall, ToolResult } from "./integration";

export class CalendarService {
  constructor(private integration: IntegrationService) {}

  /**
   * Fetch upcoming calendar events for the user.
   * By default, it fetches events starting from now.
   */
  async getUpcomingEvents(tenantId: string, timeMin: string = new Date().toISOString(), maxResults: number = 10): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "googlecalendar",
      action: "api.events.getMany",
      args: { 
        timeMin, 
        maxResults,
        singleEvents: true,
        orderBy: "startTime"
      }
    };
    
    return this.integration.executeTool(tenantId, call);
  }
  /**
   * Check availability for a list of emails between two times.
   */
  async checkAvailability(tenantId: string, timeMin: string, timeMax: string, emails: string[]): Promise<ToolResult> {
    const call: ToolCall = {
      plugin: "googlecalendar",
      action: "api.calendar.getAvailability",
      args: { 
        timeMin, 
        timeMax,
        items: emails.map(email => ({ id: email }))
      }
    };
    
    return this.integration.executeTool(tenantId, call);
  }
}
