import { CalendarService } from "./calendar";
import { GroqAdapter } from "./agent/groq";
import { CorsairIntegrationService } from "./integration";
import { createClient } from "./supabase/server";
import { GmailService } from "./gmail";
import { TriageInputService } from "./triage";
import { TriageItemService, type TriageResponse } from "./triage-items";
import { GroqTriageClassifier, rankTriageInputs, type TriageClassifier } from "./triage-ranking";

export class TriageBriefingAuthError extends Error {
  constructor() {
    super("Authentication is required to load the triage briefing.");
    this.name = "TriageBriefingAuthError";
  }
}

export interface TriageBriefingDependencies {
  createServerClient?: typeof createClient;
  inputService?: TriageInputService;
  itemService?: TriageItemService;
  classifier?: TriageClassifier;
}

export class TriageBriefingService {
  private readonly createServerClient: typeof createClient;
  private readonly inputService: TriageInputService;
  private readonly itemService: TriageItemService;
  private readonly classifier: TriageClassifier;

  constructor(dependencies: TriageBriefingDependencies = {}) {
    this.createServerClient = dependencies.createServerClient ?? createClient;
    const integration = new CorsairIntegrationService();
    this.inputService =
      dependencies.inputService ??
      new TriageInputService(new GmailService(integration), new CalendarService(integration));
    this.itemService = dependencies.itemService ?? new TriageItemService(this.createServerClient);
    this.classifier = dependencies.classifier ?? new GroqTriageClassifier(new GroqAdapter());
  }

  async getBriefing(limit?: number): Promise<TriageResponse> {
    const supabase = await this.createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) throw new TriageBriefingAuthError();

    const inputs = await this.inputService.retrieve(user.id);

    // Fetch user settings to get VIP contacts
    const { data: settings } = await supabase
      .from("user_settings")
      .select("vip_contacts")
      .eq("user_id", user.id)
      .single();

    const vipContacts: string[] = settings?.vip_contacts || [];

    const ranked = await rankTriageInputs(inputs, {
      relevantAddresses: [...(user.email ? [user.email] : []), ...vipContacts],
      classifier: this.classifier,
    });

    await this.itemService.persist(ranked);
    return this.itemService.getResponse(limit, inputs);
  }
}
