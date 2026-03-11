import { BackgroundStyle, Mode, Model, TopicPack, TopicPrompt, TrendingTopic, SpatialTask } from './types';

export const SELF_HOSTED_DEFAULT_PRIORITY = 50;
export const GITHUB_DEFAULT_PRIORITY = 100;

// Derived at runtime from models.json routing_category field — no manual sync needed
export function isThinkingModel(modelId: string, models: Model[]): boolean {
  return models.find(m => m.id === modelId)?.routing_category === 'reasoning';
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

// Mode-specific recipe cards for empty state
// Each recipe has emoji, label, description, and prompt template
export interface RecipeCard {
  emoji: string;
  label: string;
  description: string;
  prompt: string;
}

export const MODE_RECIPES: Partial<Record<Mode, RecipeCard[]>> = {
  compare: [
    {
      emoji: '🔍',
      label: 'Hallucination Detector',
      description: 'See which models hallucinate',
      prompt: 'Is this actually true? Give evidence: '
    },
    {
      emoji: '📊',
      label: 'Model Shootout',
      description: 'Find the best model for a task',
      prompt: 'Answer precisely in one paragraph: '
    },
    {
      emoji: '🧬',
      label: 'Personality Test',
      description: 'See how models differ in voice',
      prompt: 'What is your honest opinion on: '
    },
    {
      emoji: '⏱️',
      label: 'Speed vs Quality',
      description: 'Compare latency and output quality',
      prompt: 'Write a concise function that '
    }
  ],
  analyze: [
    {
      emoji: '🧠',
      label: 'Collective Intelligence',
      description: 'Many models, one synthesis',
      prompt: 'Research and synthesize all perspectives on: '
    },
    {
      emoji: '⚖️',
      label: 'Tradeoff Analysis',
      description: 'Weigh every angle',
      prompt: 'What are the real tradeoffs between '
    },
    {
      emoji: '🔬',
      label: 'Small vs Big',
      description: 'Can small models match GPT-4.1?',
      prompt: 'Answer this and I\'ll compare quality: '
    }
  ],
  debate: [
    {
      emoji: '🤔',
      label: 'Devil\'s Advocate',
      description: 'Force models to disagree',
      prompt: 'Argue for and against: '
    },
    {
      emoji: '🔮',
      label: 'Predict the Future',
      description: 'Competing forecasts',
      prompt: 'What will happen in 5 years with: '
    },
    {
      emoji: '⚔️',
      label: 'Tech Holy War',
      description: 'Pick a hot take, watch them fight',
      prompt: ''
    }
  ]
};

// Legacy string prompts for backwards compatibility
export const MODE_EXAMPLE_PROMPTS: Partial<Record<Mode, string[]>> = {
  compare: MODE_RECIPES.compare?.map(r => r.prompt) || [],
  analyze: MODE_RECIPES.analyze?.map(r => r.prompt) || [],
  debate: MODE_RECIPES.debate?.map(r => r.prompt) || [],
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
    publishedAt: '2026-03-05',
  },
  {
    id: 'chips-3nm',
    title: '3nm edge devices clear FCC for on-device LLM acceleration',
    summary: 'Vendors claim 2× energy efficiency for 70B-parameter quantized models on consumer hardware.',
    source: 'SemiDaily',
    tags: ['hardware', 'ai'],
    publishedAt: '2026-03-04',
  },
  {
    id: 'open-weights',
    title: 'Open-weights contest rewards best safety-tuned small models',
    summary: 'Competition encourages transparent training recipes and evals instead of closed checkpoints.',
    source: 'MLHub',
    tags: ['open-source', 'models'],
    publishedAt: '2026-03-03',
  },
  {
    id: 'security-supply-chain',
    title: 'Software supply chain bill moves forward with SBOM enforcement',
    summary: 'Requires signed artifacts, provenance attestations, and runtime monitoring for critical infra.',
    source: 'CyberBrief',
    tags: ['security', 'devsecops'],
    publishedAt: '2026-03-02',
  },
  {
    id: 'creator-tools',
    title: 'Creator tooling boom: multimodal editing in the browser',
    summary: 'WebGPU-first editors ship video, audio, and 3D pipelines without native installs.',
    source: 'CreatorBeat',
    tags: ['media', 'webgpu'],
    publishedAt: '2026-03-01',
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

// System prompts for orchestration modes - focused and directive
export const ANALYZE_RESPONSE_SYSTEM = `You are analyzing a question in a multi-model session.

Focus on:
- Accuracy: direct, objective reasoning
- Clarity: explain step-by-step
- Conciseness: 50-150 words
- No preamble or meta-commentary`;

export const DEBATE_TURN_SYSTEM = `You are responding to a question in a multi-model debate.

Your turn:
- Answer directly and clearly
- Build on or challenge prior points if relevant
- Show your reasoning explicitly
- Keep to 50-150 words`;

// Spatial reasoning benchmark tasks
// Hand-curated tasks grounded in 2025-2026 spatial reasoning research (SpatialBench, SpatialText, SnorkelSpatial)

export const SPATIAL_REASONING_TASKS: Record<string, SpatialTask[]> = {
  route: [
    {
      id: 'route-001',
      category: 'route',
      prompt: `You are standing at the front door of a house.
The living room is through the left doorway, with a sofa facing the east wall.
The kitchen is south of the living room, accessed through a doorway on the far wall.
Describe how to reach the kitchen from where you are standing.`,
      expected_answer: 'turn left, enter living room, walk to the south wall, pass through doorway into kitchen',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    {
      id: 'route-002',
      category: 'route',
      prompt: `Imagine you are in a museum. You enter through the main entrance facing north.
To your right (east) is the sculpture gallery. Beyond that is the painting hall.
The café is west of the main entrance.
If you want to visit the painting hall first, then the café, describe your route.`,
      expected_answer: 'turn right, enter sculpture gallery, continue east to painting hall, then return west past entrance to café',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    {
      id: 'route-003',
      category: 'route',
      prompt: `You are at the center of a circular plaza. North is the park entrance.
East of center is the fountain. West of center is the market.
South of center is the town hall.
To reach the market from where you are, which direction do you walk?`,
      expected_answer: 'west',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    {
      id: 'route-004',
      category: 'route',
      prompt: `You are in a library facing a bookshelf. The reference desk is to your right.
Behind you (past the entrance you came from) is the children's section.
To your left is the reading area.
If you need to go to the reference desk, then the children's section, describe your sequence of turns.`,
      expected_answer: 'turn right to reach reference desk, then turn around and walk back past entrance to reach children\'s section',
      answer_format: 'direction',
      difficulty: 'medium'
    },
    {
      id: 'route-005',
      category: 'route',
      prompt: `Starting at the corner of Main Street and Oak Avenue, facing east along Main Street.
The bank is on your right (south side).
The pharmacy is across the street on your left (north side).
To reach the pharmacy, what do you do?`,
      expected_answer: 'cross the street to the left, or turn left to face north then cross',
      answer_format: 'direction',
      difficulty: 'easy'
    }
  ],
  relationship: [
    {
      id: 'relationship-001',
      category: 'relationship',
      prompt: `Scene: A round table is in the center of the room.
A red chair is on the north side, a blue chair on the west side, a green chair on the south side.
What color chair is directly opposite the red chair?`,
      expected_answer: 'green',
      answer_format: 'entity',
      difficulty: 'easy'
    },
    {
      id: 'relationship-002',
      category: 'relationship',
      prompt: `In a rectangular arrangement: Alice sits north, Bob sits east of Alice, Carol sits south of Bob.
If David sits west of Carol, where is David relative to Alice?`,
      expected_answer: 'west of Alice',
      answer_format: 'entity',
      difficulty: 'medium'
    },
    {
      id: 'relationship-003',
      category: 'relationship',
      prompt: `A book is on a shelf above a box.
The box is to the left of a lamp.
The lamp is to the right of a plant.
If the plant is on the left, what is the correct left-to-right order on the ground level?`,
      expected_answer: 'plant, box, lamp',
      answer_format: 'entity',
      difficulty: 'medium'
    },
    {
      id: 'relationship-004',
      category: 'relationship',
      prompt: `Three buildings arranged in a line: Town Hall is in the center.
The Library is to the left (west) of Town Hall.
The School is to the right (east) of Town Hall.
Which building is furthest east?`,
      expected_answer: 'School',
      answer_format: 'entity',
      difficulty: 'easy'
    },
    {
      id: 'relationship-005',
      category: 'relationship',
      prompt: `In a parking lot: A red car is parked north of a blue car.
The blue car is parked east of a yellow car.
Is the red car north or south of the yellow car?`,
      expected_answer: 'north and east',
      answer_format: 'description',
      difficulty: 'medium'
    }
  ],
  perspective: [
    {
      id: 'perspective-001',
      category: 'perspective',
      prompt: `You are standing in the garden facing north toward the house.
To your left is the oak tree. To your right is the shed.
In absolute coordinates (where north is up), describe the positions of the tree and shed relative to the house.`,
      expected_answer: 'oak tree is west of observer, shed is east of observer',
      answer_format: 'description',
      difficulty: 'medium'
    },
    {
      id: 'perspective-002',
      category: 'perspective',
      prompt: `Imagine a person facing east with a river on their right.
In absolute terms, which direction is the river?`,
      expected_answer: 'south',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    {
      id: 'perspective-003',
      category: 'perspective',
      prompt: `You are sitting at a dining table facing your friend across from you.
Your friend\'s right hand points toward the window.
In absolute terms, which wall is the window on?`,
      expected_answer: 'depends on which direction you are facing',
      answer_format: 'description',
      difficulty: 'hard'
    },
    {
      id: 'perspective-004',
      category: 'perspective',
      prompt: `A person is walking north. They turn 90 degrees to their right.
In which absolute direction are they now walking?`,
      expected_answer: 'east',
      answer_format: 'direction',
      difficulty: 'easy'
    },
    {
      id: 'perspective-005',
      category: 'perspective',
      prompt: `You are facing west. A car is to your left.
In absolute terms, which direction is the car from you?`,
      expected_answer: 'south',
      answer_format: 'direction',
      difficulty: 'medium'
    }
  ]
};
