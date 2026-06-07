import { CampaignOverviewScreen } from "./overview/campaign_overview";

// Audience
import { ContactsScreen } from "./audience/contacts_screen";
import { ListsScreen } from "./audience/lists_screen";
import { SegmentsScreen } from "./audience/segments_screen";
import { TagsFieldsScreen } from "./audience/tags_fields_screen";
import { LeadScoringScreen } from "./audience/lead_scoring_screen";
import { SuppressionScreen } from "./audience/suppression_screen";

// Campaigns
import { AllCampaignsScreen } from "./campaigns/all_campaigns_screen";
import { EmailBuilderScreen } from "./campaigns/email_builder_screen";
import { TemplatesScreen } from "./campaigns/templates_screen";
import { ContentBlocksScreen } from "./campaigns/content_blocks_screen";
import { PersonalizationScreen } from "./campaigns/personalization_screen";
import { ABTestingScreen } from "./campaigns/ab_testing_screen";
import { SendTimeScreen } from "./campaigns/send_time_screen";
import { CalendarScreen } from "./campaigns/calendar_screen";

// Automations
import { WorkflowsScreen } from "./automations/workflows_screen";
import { JourneysScreen } from "./automations/journeys_screen";
import { TriggersScreen } from "./automations/triggers_screen";
import { ConditionsGoalsScreen } from "./automations/conditions_goals_screen";
import { RecipesScreen } from "./automations/recipes_screen";

// Channels
import { EmailChannelScreen } from "./channels/email_channel_screen";
import { SmsScreen } from "./channels/sms_screen";
import { WhatsAppScreen } from "./channels/whatsapp_screen";
import { PushScreen } from "./channels/push_screen";
import { InAppScreen } from "./channels/in_app_screen";

// Transactional
import { EmailApiScreen } from "./transactional/email_api_screen";
import { SmtpRelayScreen } from "./transactional/smtp_relay_screen";
import { TransactionalTemplatesScreen } from "./transactional/transactional_templates_screen";
import { InboundRoutingScreen } from "./transactional/inbound_routing_screen";
import { MessageLogsScreen } from "./transactional/message_logs_screen";

// Deliverability
import { SendingDomainsScreen } from "./deliverability/sending_domains_screen";
import { AuthenticationScreen } from "./deliverability/authentication_screen";
import { DedicatedIpsScreen } from "./deliverability/dedicated_ips_screen";
import { IpWarmupScreen } from "./deliverability/ip_warmup_screen";
import { InboxPlacementScreen } from "./deliverability/inbox_placement_screen";
import { BlocklistMonitorScreen } from "./deliverability/blocklist_monitor_screen";
import { EmailValidationScreen } from "./deliverability/email_validation_screen";

// CRM
import { DealsScreen } from "./crm/deals_screen";
import { PipelinesScreen } from "./crm/pipelines_screen";
import { TasksScreen } from "./crm/tasks_screen";
import { CompaniesScreen } from "./crm/companies_screen";
import { ActivityScreen } from "./crm/activity_screen";

// Inbox
import { ConversationsScreen } from "./inbox/conversations_screen";
import { SmsInboxScreen } from "./inbox/sms_inbox_screen";
import { WhatsappInboxScreen } from "./inbox/whatsapp_inbox_screen";
import { LiveChatScreen } from "./inbox/live_chat_screen";

// Acquisition
import { FormsScreen } from "./acquisition/forms_screen";
import { LandingPagesScreen } from "./acquisition/landing_pages_screen";
import { PopupsScreen } from "./acquisition/popups_screen";
import { SurveysScreen } from "./acquisition/surveys_screen";
import { SourceTrackingScreen } from "./acquisition/source_tracking_screen";

// Commerce
import { StoresScreen } from "./commerce/stores_screen";
import { ProductsScreen } from "./commerce/products_screen";
import { OrdersScreen } from "./commerce/orders_screen";
import { AbandonedCartsScreen } from "./commerce/abandoned_carts_screen";
import { CouponsScreen } from "./commerce/coupons_screen";
import { RecommendationsScreen } from "./commerce/recommendations_screen";

// Content
import { AssetLibraryScreen } from "./content/asset_library_screen";
import { BrandKitScreen } from "./content/brand_kit_screen";
import { ImageEditorScreen } from "./content/image_editor_screen";
import { FilesScreen } from "./content/files_screen";

// Reporting
import { DashboardsScreen } from "./reporting/dashboards_screen";
import { CampaignComparisonScreen } from "./reporting/campaign_comparison_screen";
import { EngagementScreen } from "./reporting/engagement_screen";
import { AttributionScreen } from "./reporting/attribution_screen";
import { DeliverabilityReportsScreen } from "./reporting/deliverability_reports_screen";
import { CustomReportsScreen } from "./reporting/custom_reports_screen";

// AI Assistant
import { CampaignBriefScreen } from "./ai_assistant/campaign_brief_screen";
import { CopyGeneratorScreen } from "./ai_assistant/copy_generator_screen";
import { SubjectLinesScreen } from "./ai_assistant/subject_lines_screen";
import { SegmentSuggestionsScreen } from "./ai_assistant/segment_suggestions_screen";
import { CampaignHealthScreen } from "./ai_assistant/campaign_health_screen";

// Data
import { CustomObjectsScreen } from "./data/custom_objects_screen";
import { CatalogsScreen } from "./data/catalogs_screen";
import { EventTrackingScreen } from "./data/event_tracking_screen";
import { WarehouseSyncScreen } from "./data/warehouse_sync_screen";

// Integrations
import { AppsScreen } from "./integrations/apps_screen";
import { WebhooksScreen } from "./integrations/webhooks_screen";
import { ApiKeysScreen } from "./integrations/api_keys_screen";

// Settings
import { GeneralSettingsScreen } from "./settings/general_settings_screen";
import { TeamRolesScreen } from "./settings/team_roles_screen";
import { ApprovalsScreen } from "./settings/approvals_screen";
import { BrandingScreen } from "./settings/branding_screen";
import { BillingScreen } from "./settings/billing_screen";
import { ConnectionsScreen } from "./settings/connections_screen";
import { AdvancedSettingsScreen } from "./settings/advanced_settings_screen";

// Maps a sidebar tab title to the screen component that renders it.
// Titles not present here fall back to the PlaceholderScreen.
export const SCREEN_REGISTRY = {
  Overview: CampaignOverviewScreen,

  // Audience
  Contacts: ContactsScreen,
  Lists: ListsScreen,
  Segments: SegmentsScreen,
  "Tags & Fields": TagsFieldsScreen,
  "Lead Scoring": LeadScoringScreen,
  Suppression: SuppressionScreen,

  // Campaigns
  "All Campaigns": AllCampaignsScreen,
  "Email Builder": EmailBuilderScreen,
  Templates: TemplatesScreen,
  "Content Blocks": ContentBlocksScreen,
  Personalization: PersonalizationScreen,
  "A/B Testing": ABTestingScreen,
  "Send-Time Optimization": SendTimeScreen,
  Calendar: CalendarScreen,

  // Automations
  Workflows: WorkflowsScreen,
  Journeys: JourneysScreen,
  Triggers: TriggersScreen,
  "Conditions & Goals": ConditionsGoalsScreen,
  Recipes: RecipesScreen,

  // Channels
  Email: EmailChannelScreen,
  SMS: SmsScreen,
  WhatsApp: WhatsAppScreen,
  Push: PushScreen,
  "In-App": InAppScreen,

  // Transactional
  "Email API": EmailApiScreen,
  "SMTP Relay": SmtpRelayScreen,
  "Transactional Templates": TransactionalTemplatesScreen,
  "Inbound Routing": InboundRoutingScreen,
  "Message Logs": MessageLogsScreen,

  // Deliverability
  "Sending Domains": SendingDomainsScreen,
  Authentication: AuthenticationScreen,
  "Dedicated IPs": DedicatedIpsScreen,
  "IP Warmup": IpWarmupScreen,
  "Inbox Placement": InboxPlacementScreen,
  "Blocklist Monitor": BlocklistMonitorScreen,
  "Email Validation": EmailValidationScreen,

  // CRM
  Deals: DealsScreen,
  Pipelines: PipelinesScreen,
  Tasks: TasksScreen,
  Companies: CompaniesScreen,
  Activity: ActivityScreen,

  // Inbox
  Conversations: ConversationsScreen,
  "SMS Inbox": SmsInboxScreen,
  "WhatsApp Inbox": WhatsappInboxScreen,
  "Live Chat": LiveChatScreen,

  // Acquisition
  Forms: FormsScreen,
  "Landing Pages": LandingPagesScreen,
  Popups: PopupsScreen,
  Surveys: SurveysScreen,
  "Source Tracking": SourceTrackingScreen,

  // Commerce
  Stores: StoresScreen,
  Products: ProductsScreen,
  Orders: OrdersScreen,
  "Abandoned Carts": AbandonedCartsScreen,
  Coupons: CouponsScreen,
  Recommendations: RecommendationsScreen,

  // Content
  "Asset Library": AssetLibraryScreen,
  "Brand Kit": BrandKitScreen,
  "Image Editor": ImageEditorScreen,
  Files: FilesScreen,

  // Reporting
  Dashboards: DashboardsScreen,
  "Campaign Comparison": CampaignComparisonScreen,
  Engagement: EngagementScreen,
  Attribution: AttributionScreen,
  "Deliverability Reports": DeliverabilityReportsScreen,
  "Custom Reports": CustomReportsScreen,

  // AI Assistant
  "Campaign Brief": CampaignBriefScreen,
  "Copy Generator": CopyGeneratorScreen,
  "Subject Lines": SubjectLinesScreen,
  "Segment Suggestions": SegmentSuggestionsScreen,
  "Campaign Health": CampaignHealthScreen,

  // Data
  "Custom Objects": CustomObjectsScreen,
  Catalogs: CatalogsScreen,
  "Event Tracking": EventTrackingScreen,
  "Warehouse Sync": WarehouseSyncScreen,

  // Integrations
  Apps: AppsScreen,
  Webhooks: WebhooksScreen,
  "API Keys": ApiKeysScreen,

  // Settings
  General: GeneralSettingsScreen,
  "Team & Roles": TeamRolesScreen,
  Approvals: ApprovalsScreen,
  Branding: BrandingScreen,
  Billing: BillingScreen,
  Connections: ConnectionsScreen,
  Advanced: AdvancedSettingsScreen,
};

export function getScreen(title) {
  return SCREEN_REGISTRY[title] || null;
}
