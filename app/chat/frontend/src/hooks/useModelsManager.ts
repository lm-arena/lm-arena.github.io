import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Model } from '../types';
import { usePersistedSetting } from './usePersistedSetting';
import { BROWSER_CAPABLE_MODEL_IDS } from '../utils/browserInference';

// Stable per-model color derived from its id — gives each model a distinct hue
function modelColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 65%, 55%)`;
}
import servicesConfig from '../data/services.json';

const SERVICES = servicesConfig.services as { key: string; modelId: string; localPort: number }[];

// Static map: model.id → service.key (used to send the right model key to the gateway)
const MODEL_KEY_MAP: Record<string, string> = Object.fromEntries(
  SERVICES.map(s => [s.modelId, s.key]),
);

interface ModelsApiModel {
  id: string;
  name?: string;
  type?: string;
  priority?: number;
  context_length?: number;
  default?: boolean;
  routing_category?: string | null;
}

interface ModelsApiResponse {
  models: ModelsApiModel[];
}

const TUNNEL_REGISTRY = 'https://tunnel-registry.jonasneves.workers.dev';

export function useModelsManager() {
  const [modelsData, setModelsData] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onlineKeys, setOnlineKeys] = useState<Set<string>>(new Set());

  // Multi-model selection (for Compare, Analyze, Debate, Personalities)
  const [persistedSelected, setPersistedSelected] = usePersistedSetting<string[] | null>('playground_selected_models', null);
  const isSelectionInitialized = useRef(persistedSelected !== null);

  // Chat mode uses a separate, independent model selection
  const [chatModelId, setChatModelId] = usePersistedSetting<string | null>('playground_chat_model', null);
  const isChatModelInitialized = useRef(chatModelId !== null);

  const selected = useMemo(() => persistedSelected ?? [], [persistedSelected]);

  const setSelected = useCallback((value: string[] | ((prev: string[]) => string[])) => {
    setPersistedSelected(prev => {
      const safePrev = prev ?? [];
      return typeof value === 'function' ? value(safePrev) : value;
    });
  }, [setPersistedSelected]);

  const [moderator, setModerator] = useState<string>('');

  const loadModels = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetch('/models.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: ModelsApiResponse = await response.json();
      if (!data.models?.length) throw new Error('No models in models.json');

      const apiModels = data.models
        .filter((model) => model.type !== 'external')
        .map((model) => {
          const modelType: 'self-hosted' | 'github' =
            (model.type === 'github' || model.type === 'api') ? 'github' : 'self-hosted';
          return {
            id: model.id,
            name: model.name || model.id,
            color: modelColor(model.id),
            type: modelType,
            response: '',
            priority: model.priority,
            context_length: model.context_length,
            default: model.default,
            routing_category: model.routing_category,
          };
        });

      // Prepend virtual "Auto" model — always available, gateway picks the best
      const autoModel = {
        id: 'auto',
        name: 'Auto',
        color: '#8b5cf6',
        type: 'self-hosted' as const,
        response: '',
        priority: -1,
        default: false,
      };
      setModelsData([autoModel, ...apiModels]);

      // Fetch online model keys from registry (best-effort)
      fetch(`${TUNNEL_REGISTRY}/v1/models`)
        .then(r => r.ok ? r.json() : { data: [] })
        .then(data => setOnlineKeys(new Set((data.data ?? []).map((m: { id: string }) => m.id))))
        .catch(() => {});

      setIsLoading(false);

      if (!isSelectionInitialized.current) {
        setPersistedSelected([]);
        isSelectionInitialized.current = true;
      }

      // Initialize chat model: gpt-4o > default > first github > first available
      if (!isChatModelInitialized.current) {
        const gpt4o = apiModels.find(m => m.id === 'openai/gpt-4o');
        const defaultModel = apiModels.find(m => m.default);
        const firstApiModel = apiModels.find(m => m.type === 'github');
        setChatModelId(gpt4o?.id ?? defaultModel?.id ?? firstApiModel?.id ?? apiModels[0]?.id ?? null);
        isChatModelInitialized.current = true;
      }

      // Set moderator: prefer github model, then default, then first available
      const moderatorId = apiModels.find(m => m.type === 'github')?.id
        ?? apiModels.find(m => m.default)?.id
        ?? apiModels[0]?.id
        ?? '';
      setModerator(moderatorId);

    } catch {
      setIsLoading(false);
      setLoadError('Could not load models');
    }
  }, [setPersistedSelected, setChatModelId]);

  const retryNow = useCallback(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const availableModels = useMemo(
    () => modelsData.filter(m => m.id !== 'auto' && !selected.includes(m.id)),
    [modelsData, selected],
  );

  const { totalModelsByType, allSelectedByType } = useMemo(() => {
    const total = {
      'self-hosted': modelsData.filter(m => m.id !== 'auto' && m.type === 'self-hosted').length,
      github: modelsData.filter(m => m.type === 'github').length,
    };
    const selectedCount = {
      'self-hosted': modelsData.filter(m => m.type === 'self-hosted' && selected.includes(m.id)).length,
      github: modelsData.filter(m => m.type === 'github' && selected.includes(m.id)).length,
    };

    return {
      totalModelsByType: total,
      allSelectedByType: {
        'self-hosted': total['self-hosted'] > 0 && selectedCount['self-hosted'] === total['self-hosted'],
        github: total.github > 0 && selectedCount.github === total.github,
      } as Record<'self-hosted' | 'github', boolean>,
    };
  }, [modelsData, selected]);

  const modelIdToName = useCallback(
    (id: string) => modelsData.find(m => m.id === id)?.name || id,
    [modelsData],
  );

  const getModelEndpoints = useCallback((models: Model[]): Record<string, string> => {
    const endpoints: Record<string, string> = {};
    const isDev = window.location.hostname === 'localhost';

    models.forEach(model => {
      if (model.id === 'auto') {
        // Virtual model — always routes through the gateway
        endpoints[model.id] = `${TUNNEL_REGISTRY}/v1`;
        return;
      }
      if (model.type === 'self-hosted') {
        const service = SERVICES.find(s => s.modelId === model.id);
        if (isDev) {
          endpoints[model.id] = `http://localhost:${service?.localPort ?? 8000}/v1`;
        } else if (service && onlineKeys.has(service.key)) {
          endpoints[model.id] = `${TUNNEL_REGISTRY}/v1`;
        }
      } else if (model.type === 'github') {
        endpoints[model.id] = 'https://models.github.ai/inference';
      }
    });

    return endpoints;
  }, [onlineKeys]);

  const onlineModelIds = useMemo(() => {
    const isDev = window.location.hostname === 'localhost';
    // GitHub models are always reachable via the GitHub Models API
    const githubModelIds = modelsData.filter(m => m.type === 'github').map(m => m.id);
    if (isDev) return new Set([...modelsData.filter(m => m.type === 'self-hosted').map(m => m.id), ...githubModelIds]);
    const online = new Set<string>(githubModelIds);
    for (const service of SERVICES) {
      if (onlineKeys.has(service.key)) online.add(service.modelId);
    }
    // "auto" is available whenever at least one self-hosted model is online
    if (onlineKeys.size > 0) online.add('auto');
    // Browser-capable models are always selectable — they fall back to in-browser ONNX
    for (const id of BROWSER_CAPABLE_MODEL_IDS) {
      if (modelsData.some(m => m.id === id)) online.add(id);
    }
    return online;
  }, [onlineKeys, modelsData]);

  return {
    modelsData,
    setModelsData,
    selected,
    setSelected,
    chatModelId,
    setChatModelId,
    moderator,
    setModerator,
    availableModels,
    totalModelsByType,
    allSelectedByType,
    modelIdToName,
    isLoading,
    loadError,
    retryNow,
    getModelEndpoints,
    onlineModelIds,
    modelKeyMap: MODEL_KEY_MAP,
  };
}
