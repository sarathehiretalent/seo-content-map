export const SEARCH_INTENTS = ['informational', 'transactional', 'commercial', 'navigational'] as const
export type SearchIntent = (typeof SEARCH_INTENTS)[number]

export const CONTENT_TYPES = ['hub', 'spoke', 'pillar', 'cluster', 'supporting'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const COMPETITION_LEVELS = ['low', 'medium', 'high'] as const
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number]

export const CONTENT_STATUSES = ['not_started', 'in_progress', 'published'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const DIAGNOSTIC_STATUSES = [
  'pending', 'fetching', 'enriching', 'serp_analyzing',
  'detecting_structure', 'classifying', 'completed', 'failed'
] as const
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number]

export const CONTENTMAP_STATUSES = [
  'pending', 'clustering', 'ideating', 'optimizing',
  'aoe', 'scoring', 'completed', 'failed'
] as const
export type ContentMapStatus = (typeof CONTENTMAP_STATUSES)[number]

export const ISSUE_TYPES = [
  'thin_content', 'missing_intent', 'poor_structure',
  'missing_serp_feature', 'cannibalization', 'outdated', 'low_ctr'
] as const
export type IssueType = (typeof ISSUE_TYPES)[number]

export const AOE_ENGINES = [
  'google_ai_overview', 'chatgpt', 'perplexity',
  'featured_snippet', 'paa'
] as const
export type AoeEngine = (typeof AOE_ENGINES)[number]

export const CONTENT_FORMATS = [
  'direct_answer', 'faq', 'how_to', 'comparison',
  'definition', 'list'
] as const
export type ContentFormat = (typeof CONTENT_FORMATS)[number]

export const INTENT_LABELS: Record<SearchIntent, string> = {
  informational: 'Informational',
  transactional: 'Transactional',
  commercial: 'Commercial',
  navigational: 'Navigational',
}

export const INTENT_COLORS: Record<SearchIntent, string> = {
  informational: 'bg-blue-500/20 text-blue-300',
  transactional: 'bg-green-500/20 text-green-300',
  commercial: 'bg-amber-500/20 text-amber-300',
  navigational: 'bg-purple-500/20 text-purple-300',
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  critical: 'bg-red-500/20 text-red-300',
  high: 'bg-orange-500/20 text-orange-300',
  medium: 'bg-yellow-500/20 text-yellow-300',
  low: 'bg-slate-500/20 text-slate-300',
}
