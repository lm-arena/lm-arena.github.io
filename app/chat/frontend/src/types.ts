export interface Model {
  id: string;
  name: string;
  color: string;
  response: string;
  thinking?: string;
  type?: 'self-hosted' | 'github';
  error?: string;
  statusMessage?: string; // Temporary system messages (rate limiting, etc.) - not part of conversation history
  personaEmoji?: string; // Emoji representing the persona
  personaName?: string; // Name of the persona
  personaTrait?: string; // Key trait/perspective of the persona

  // Metadata from backend
  priority?: number;
  context_length?: number;
  default?: boolean;
}

export type Mode = 'compare' | 'analyze' | 'debate' | 'chat';

export interface Position {
  x: number;
  y: number;
  angle: number;
}

export type BackgroundStyle = 'dots' | 'grid' | 'mesh' | 'dots-mesh' | 'dots-fade' | 'animated-mesh' | 'none';

export interface TopicPrompt {
  id: string;
  label: string;
  prompt: string;
  category?: string;
  modes?: Mode[];
  tags?: string[];
}

export interface TopicPack {
  id: string;
  title: string;
  description: string;
  topics: TopicPrompt[];
}

export interface TrendingTopic {
  id: string;
  title: string;
  summary: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  tags?: string[];
}

export type ChatHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
  kind?: 'compare_summary'
  | 'analyze_synthesis'
  | 'analyze_response'
  | 'debate_turn';
};
