import { BackgroundStyle, Mode, TopicPack, TopicPrompt, TrendingTopic } from './types';

export const MODEL_META: Record<string, { color: string; name?: string }> = {
  'self-hosted': { color: '#10b981' }, // Green for self-hosted models
  'github': { color: '#3b82f6' },      // Blue for GitHub Models
};

export const SELF_HOSTED_DEFAULT_PRIORITY = 50;
export const GITHUB_DEFAULT_PRIORITY = 100;

// Models that output thinking content by default (without explicit <think> tags)
// These models start in "thinking mode" and we treat all content as thinking until </think>
export const THINKING_MODELS: string[] = [
  'deepseek-r1-distill-qwen-1.5b',
  'r1qwen',           // Alternate match
  'smollm3',          // SmolLM3 uses <think> tags
  'nanbeige',         // Nanbeige4-3B Thinking
];

export function isThinkingModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return THINKING_MODELS.some(pattern => lower.includes(pattern.toLowerCase()));
}

export function getModelPriority(modelId: string, modelType: 'self-hosted' | 'github', dynamicPriority?: number): number {
  if (dynamicPriority !== undefined) {
    return dynamicPriority;
  }

  return modelType === 'self-hosted' ? SELF_HOSTED_DEFAULT_PRIORITY : GITHUB_DEFAULT_PRIORITY;
}

// Curated static topics grounded in current-ish industry/news contexts
export const CURATED_TOPICS: TopicPrompt[] = [
  {
    id: 'eu-ai-act-enforcement',
    label: 'EU AI Act Enforcement Wave',
    prompt: "The EU AI Act enters enforcement; high-risk systems must prove data provenance, evals, and risk controls. Outline compliance gaps for a frontier model API and tradeoffs between speed and alignment.",
    category: 'Policy',
    modes: ['analyze', 'debate'],
    tags: ['governance', 'compliance'],
  },
  {
    id: 'export-controls-blackwell',
    label: 'Export Controls Tighten',
    prompt: "U.S. export rules tighten again on AI accelerators; Blackwell-class parts face new caps and cloud checks. Map the impact on training roadmaps, costs, and on-device strategies.",
    category: 'Infra',
    modes: ['compare', 'debate'],
    tags: ['chips', 'supply-chain'],
  },
  {
    id: 'weights-leak',
    label: 'Major Weights Leak',
    prompt: "A commercial frontier model checkpoint leaks. Assess risks (misuse, impersonation, jailbreak diffusion), legal exposure, and whether open red-team releases mitigate or worsen safety.",
    category: 'Security',
    modes: ['analyze', 'debate'],
    tags: ['safety', 'open-weights'],
  },
  {
    id: 'on-device-llm-race',
    label: 'On-Device LLM Race',
    prompt: "Phone OEMs ship 3nm NPUs and 20B-parameter on-device assistants. What actually moves the needle for UX, privacy, and cost vs. cloud? Where do hybrid (edge + cloud) designs win?",
    category: 'Infra',
    modes: ['compare', 'debate'],
    tags: ['edge', 'latency'],
  },
  {
    id: 'signed-app-prompt-injection',
    label: 'Signed App Prompt Injection',
    prompt: "A popular signed desktop app shipped with hardcoded system prompts; attackers use supply chain updates to exfiltrate data. How should vendors audit, sandbox, and attest LLM apps?",
    category: 'Security',
    modes: ['compare', 'analyze'],
    tags: ['supply-chain', 'prompt-injection'],
  },
  {
    id: 'eval-standardization',
    label: 'Safety Eval Standard',
    prompt: "NIST-style safety eval suites gain traction (jailbreak, autonomy, bio). How should vendors report scores, and what gaps remain for frontier vs. small models?",
    category: 'Policy',
    modes: ['compare', 'debate'],
    tags: ['evaluation', 'safety'],
  },
  {
    id: 'licensing-standoff',
    label: 'Publisher Licensing Standoff',
    prompt: "Major news publishers pause AI licensing talks and sue over training. What remedies (revenue share, opt-out registries, model removal) are realistic, and how do they ripple to open models?",
    category: 'Data',
    modes: ['analyze', 'debate'],
    tags: ['licensing', 'copyright'],
  },
  {
    id: 'sbom-for-llms',
    label: 'SBOM for LLM Pipelines',
    prompt: "Regulators push SBOMs and signed artifacts for AI stacks. Draft what should appear in an LLM pipeline SBOM (data, weights, evals, guardrails) and how to verify it at runtime.",
    category: 'Security',
    modes: ['compare', 'analyze'],
    tags: ['sbom', 'supply-chain'],
  },
  {
    id: 'data-poisoning-campaign',
    label: 'Data Poisoning Campaign',
    prompt: "Researchers find coordinated data poisoning in popular open corpora. How should model hosts detect and mitigate poisoning post-hoc, and what retraining tradeoffs are acceptable?",
    category: 'Security',
    modes: ['compare', 'debate'],
    tags: ['data', 'poisoning'],
  },
  {
    id: 'copyright-settlement',
    label: 'Copyright Settlement Sets Precedent',
    prompt: "A major copyright suit settles with dataset disclosure and per-output watermarking. Predict how this precedent affects future training sets and open-weight releases.",
    category: 'Policy',
    modes: ['debate'],
    tags: ['copyright', 'watermarking'],
  },
];

// Mode-specific example prompts for "try an example" (hardcoded, not in ticker)
// Designed for demo brevity: built-in constraints, opinionated/fun, quick to read
export const MODE_EXAMPLE_PROMPTS: Partial<Record<Mode, string[]>> = {
  analyze: [
    "What's the most important programming principle?",
    "Should code comments explain 'what' or 'why'?",
    "Is TypeScript worth the extra complexity?",
  ],
  debate: [
    "Tabs or spaces? Give your verdict.",
    "Should AI be allowed to write its own code?",
    "What will never be automated by AI?",
  ],
};

export const TOPIC_PACKS: TopicPack[] = [
  {
    id: 'policy-governance',
    title: 'Policy & Governance',
    description: 'Regulation, licensing, eval standards, and precedents.',
    topics: CURATED_TOPICS.filter(t => t.category === 'Policy' || t.category === 'Data'),
  },
  {
    id: 'infra-chips',
    title: 'Infra & Chips',
    description: 'Export controls, edge/cloud balance, and hardware constraints.',
    topics: CURATED_TOPICS.filter(t => t.category === 'Infra'),
  },
  {
    id: 'security-data',
    title: 'Security & Data',
    description: 'Leaks, poisoning, SBOMs, and supply-chain risks.',
    topics: CURATED_TOPICS.filter(t => t.category === 'Security'),
  },
];

// Keep ticker suggestions in sync with curated topics
export const SUGGESTED_TOPICS = CURATED_TOPICS;

export const TRENDING_FEED_URL =
  import.meta.env.VITE_TRENDING_FEED_URL || '/api/trending-topics';

// Lightweight fallback so the UI is never empty if the feed is unavailable
export const TRENDING_FALLBACK: TrendingTopic[] = [
  {
    id: 'ai-safety-governance',
    title: 'New AI safety governance draft targets frontier model transparency',
    summary: 'Draft policy proposes reporting training data provenance, evals for autonomous behavior, and emergency off-switch requirements.',
    source: 'PolicyWire',
    tags: ['AI', 'governance'],
    publishedAt: '2025-01-05',
  },
  {
    id: 'chips-3nm',
    title: '3nm edge devices clear FCC for on-device LLM acceleration',
    summary: 'Vendors claim 2× energy efficiency for 70B-parameter quantized models on consumer hardware.',
    source: 'SemiDaily',
    tags: ['hardware', 'ai'],
    publishedAt: '2025-01-04',
  },
  {
    id: 'open-weights',
    title: 'Open-weights contest rewards best safety-tuned small models',
    summary: 'Competition encourages transparent training recipes and evals instead of closed checkpoints.',
    source: 'MLHub',
    tags: ['open-source', 'models'],
    publishedAt: '2025-01-03',
  },
  {
    id: 'security-supply-chain',
    title: 'Software supply chain bill moves forward with SBOM enforcement',
    summary: 'Requires signed artifacts, provenance attestations, and runtime monitoring for critical infra.',
    source: 'CyberBrief',
    tags: ['security', 'devsecops'],
    publishedAt: '2025-01-02',
  },
  {
    id: 'creator-tools',
    title: 'Creator tooling boom: multimodal editing in the browser',
    summary: 'WebGPU-first editors ship video, audio, and 3D pipelines without native installs.',
    source: 'CreatorBeat',
    tags: ['media', 'webgpu'],
    publishedAt: '2025-01-01',
  },
];

export const BG_STYLES: BackgroundStyle[] = ['dots-mesh', 'dots', 'dots-fade', 'grid', 'mesh', 'animated-mesh', 'none'];

export const PLAYGROUND_BACKGROUND = '#0f172a';

// Generation defaults - centralized for easy maintenance
export const GENERATION_DEFAULTS = {
  maxTokens: 1024,      // Reasonable default for comparison
  temperature: 0.7,     // Balanced creativity/coherence
};

// UI Builder system prompt - instructs models to output interactive JSON options
export const UI_BUILDER_PROMPT = `You can output interactive UI elements using JSON. When appropriate, include clickable options:

\`\`\`json
{
  "options": [
    {"id": "opt1", "label": "Option 1", "action": "message", "value": "User selected option 1"},
    {"id": "opt2", "label": "Option 2", "action": "message", "value": "User selected option 2"}
  ]
}
\`\`\`

Guidelines:
- Use for choices, confirmations, or navigation
- 2-4 options max
- Keep labels short
- Include JSON after your text response`;

// Layout constants - centralized for consistent sizing
export const LAYOUT = {
  // Card dimensions
  cardWidth: 256,       // Width of model cards in compare mode (px)
  cardHeight: 200,      // Height of model cards in compare mode (px)

  // Grid gaps
  gapX: 24,             // Horizontal gap between cards (px)
  gapY: 24,             // Vertical gap between cards (px)

  // Circle layout (analyze, debate modes)
  baseRadius: 160,      // Minimum radius for circle layouts (px)
  minRadius: 120,       // Starting point for radius calculation (px)
  radiusPerModel: 15,   // Additional radius per model to prevent overlap (px)

  // Arena dimensions
  arenaHeight: 480,     // Height of visualization area for circle modes (px)
  scrollClamp: 200,     // Max scroll offset in either direction (px)
};

// System prompts for orchestration modes
export const ANALYZE_RESPONSE_SYSTEM = `You are participating in a multi-model analysis session.

Guidelines for your response:
- Focus on facts and problem-solving with direct, objective information
- Show your reasoning step-by-step, but keep each step concise
- Avoid unnecessary superlatives, praise, or emotional validation
- Do not repeat the question or add meta-commentary
- Get straight to the analysis - no preamble like "Let me think about this"
- When uncertain, acknowledge it and explain why rather than claiming certainty
- Be professional and objective - prioritize technical accuracy over validation

Your task:
- Provide your independent analysis of the question
- Your response will be compared with other models to identify consensus and divergence
- Focus on clear reasoning and key insights
- No need to mention other models or compare approaches

Target length: 100-200 words.`;

export const DEBATE_TURN_SYSTEM = `You are participating in a multi-model debate.

Guidelines for your response:
- Focus on facts and problem-solving with direct, objective information
- Show your reasoning step-by-step, but keep each step concise
- Avoid unnecessary superlatives, praise, or emotional validation
- Do not repeat the question or add meta-commentary
- Get straight to the analysis - no preamble like "Let me think about this"
- When uncertain, acknowledge it and explain why rather than claiming certainty
- Be professional and objective - prioritize technical accuracy over validation

Your task:
- Respond to the question considering previous responses (if any)
- You may build on, challenge, or offer alternatives to earlier points
- Bring new perspectives or evidence to the discussion
- Reference specific points from others when relevant, but stay concise
- No meta-commentary about the debate process itself

Target length: 100-200 words.`;
