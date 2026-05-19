import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth";
import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
import { buildProviderStreamFamilyHooks } from "openclaw/plugin-sdk/provider-stream";
import { createWebSearchProviderContractFields } from "openclaw/plugin-sdk/provider-web-search-config-contract";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  buildSearchCacheKey,
  readCachedSearchPayload,
  readConfiguredSecretString,
  readNumberParam,
  readProviderEnvValue,
  readStringParam,
  resolveSearchCacheTtlMs,
  resolveSearchTimeoutSeconds,
  withTrustedWebSearchEndpoint,
  wrapWebContent,
  writeCachedSearchPayload,
} from "openclaw/plugin-sdk/provider-web-search";

const PROVIDER_ID = "oci-responses-grok-web";
const WEB_SEARCH_PROVIDER_ID = "oci-grok-web";
const MODEL_ID = "xai.grok-4-1-fast-reasoning";
const REGION = process.env.OCI_RESPONSES_REGION || "us-chicago-1";
const WEB_SEARCH_CREDENTIAL_PATH =
  "plugins.entries.oci-responses-grok-web.config.webSearch.apiKey";

const BASE_URL_OPENAI =
  `https://inference.generativeai.${REGION}.oci.oraclecloud.com/openai/v1`;
const BASE_URL_ACTIONS =
  `https://inference.generativeai.${REGION}.oci.oraclecloud.com/20231130/actions/v1`;

function useProjectMode() {
  return Boolean(process.env.OCI_RESPONSES_PROJECT_OCID);
}

function getBaseUrl() {
  return useProjectMode() ? BASE_URL_OPENAI : BASE_URL_ACTIONS;
}

const RESPONSES_HOOKS = {
  ...buildProviderReplayFamilyHooks({ family: "openai-compatible" }),
  ...buildProviderStreamFamilyHooks("openai-responses-defaults"),
};

function buildModel() {
  return {
    id: MODEL_ID,
    name: "OCI xAI Grok 4.1 Fast (Reasoning + Web Search)",
    provider: PROVIDER_ID,
    api: "openai-responses",
    baseUrl: getBaseUrl(),
    reasoning: false,
    input: ["text", "image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 2000000,
    maxTokens: 16000,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPluginConfig(config) {
  const entry = config?.plugins?.entries?.[PROVIDER_ID];
  return isRecord(entry?.config) ? entry.config : undefined;
}

function getWebSearchConfig(config, searchConfig) {
  const pluginConfig = getPluginConfig(config);
  const pluginWebSearch = isRecord(pluginConfig?.webSearch)
    ? pluginConfig.webSearch
    : undefined;
  const scoped = isRecord(searchConfig?.[WEB_SEARCH_PROVIDER_ID])
    ? searchConfig[WEB_SEARCH_PROVIDER_ID]
    : undefined;
  return {
    ...(isRecord(searchConfig) ? searchConfig : {}),
    ...(pluginWebSearch ?? {}),
    ...(scoped ?? {}),
  };
}

function resolveOciResponsesApiKey(config, searchConfig) {
  const webSearch = getWebSearchConfig(config, searchConfig);
  return (
    readConfiguredSecretString(webSearch?.apiKey, WEB_SEARCH_CREDENTIAL_PATH) ??
    readProviderEnvValue(["OCI_RESPONSES_API_KEY", "OPENAI_API_KEY"])
  );
}

function resolveOciResponsesRegion(config, searchConfig) {
  const webSearch = getWebSearchConfig(config, searchConfig);
  const value = typeof webSearch?.region === "string" && webSearch.region.trim()
    ? webSearch.region.trim()
    : process.env.OCI_RESPONSES_REGION || REGION;
  return value;
}

function resolveOciResponsesModel(config, searchConfig) {
  const webSearch = getWebSearchConfig(config, searchConfig);
  return typeof webSearch?.model === "string" && webSearch.model.trim()
    ? webSearch.model.trim()
    : MODEL_ID;
}

function resolveOciBaseUrl(config, searchConfig) {
  const webSearch = getWebSearchConfig(config, searchConfig);
  if (typeof webSearch?.baseUrl === "string" && webSearch.baseUrl.trim()) {
    return webSearch.baseUrl.trim().replace(/\/$/, "");
  }
  const region = resolveOciResponsesRegion(config, searchConfig);
  const baseOpenai =
    `https://inference.generativeai.${region}.oci.oraclecloud.com/openai/v1`;
  const baseActions =
    `https://inference.generativeai.${region}.oci.oraclecloud.com/20231130/actions/v1`;
  return useProjectMode() ? baseOpenai : baseActions;
}

function collectOutputText(value, out = []) {
  if (typeof value === "string") return out;
  if (!isRecord(value) && !Array.isArray(value)) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectOutputText(item, out);
    return out;
  }
  if (typeof value.output_text === "string") out.push(value.output_text);
  if (value.type === "output_text" && typeof value.text === "string") out.push(value.text);
  if (typeof value.text === "string" && typeof value.type === "string" && value.type.includes("text")) {
    out.push(value.text);
  }
  for (const key of ["output", "content", "message", "choices", "data"]) {
    if (key in value) collectOutputText(value[key], out);
  }
  return out;
}

function collectCitations(value, out = []) {
  if (!isRecord(value) && !Array.isArray(value)) return out;
  if (Array.isArray(value)) {
    for (const item of value) collectCitations(item, out);
    return out;
  }

  const url = typeof value.url === "string" ? value.url :
    typeof value.uri === "string" ? value.uri :
      typeof value.href === "string" ? value.href : undefined;
  if (url && /^https?:\/\//i.test(url)) {
    const title = typeof value.title === "string" ? value.title :
      typeof value.name === "string" ? value.name : undefined;
    if (!out.some((item) => item.url === url)) out.push({ url, title });
  }
  for (const child of Object.values(value)) collectCitations(child, out);
  return out.slice(0, 12);
}

async function requestOciResponsesWebSearch(params) {
  const endpoint = `${params.baseUrl}/responses`;
  const count = Number.isFinite(params.count) ? params.count : 5;
  const prompt = [
    "Use web_search para responder com informacoes atuais e verificaveis.",
    "Responda em portugues do Brasil.",
    "Nao invente noticias, nomes, datas, numeros ou fontes.",
    "Quando possivel, inclua datas concretas e mencione as fontes consultadas.",
    `Limite-se aos ${count} pontos mais importantes.`,
    "",
    "Pedido do usuario:",
    params.query,
  ].join("\n");

  const body = {
    model: params.model,
    input: prompt,
    tools: [{ type: "web_search" }],
    ...(useProjectMode() ? {} : { store: false }),
  };

  const headers = {
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
  };
  if (useProjectMode()) {
    headers["openai-project"] = process.env.OCI_RESPONSES_PROJECT_OCID;
  }

  return await withTrustedWebSearchEndpoint(
    {
      url: endpoint,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      signal: params.signal,
    },
    async (res) => {
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const detail = data?.error?.message || data?.message || text || res.statusText;
        throw new Error(`OCI Responses API error (${res.status}): ${detail}`);
      }
      return data ?? {};
    },
  );
}

async function executeOciGrokWebSearch(ctx, args, context) {
  const query = readStringParam(args, "query", { required: true });
  const count = readNumberParam(args, "count", { integer: true }) ??
    ctx.searchConfig?.maxResults ?? 5;
  const searchConfig = getWebSearchConfig(ctx.config, ctx.searchConfig);
  const apiKey = resolveOciResponsesApiKey(ctx.config, ctx.searchConfig);
  if (!apiKey) {
    return {
      error: "missing_oci_responses_api_key",
      message:
        "web_search (oci-grok-web) precisa de OCI_RESPONSES_API_KEY no ambiente do gateway ou em plugins.entries.oci-responses-grok-web.config.webSearch.apiKey.",
      docs: "https://docs.openclaw.ai/tools/web",
    };
  }

  const model = resolveOciResponsesModel(ctx.config, ctx.searchConfig);
  const baseUrl = resolveOciBaseUrl(ctx.config, ctx.searchConfig);
  const timeoutSeconds = resolveSearchTimeoutSeconds(searchConfig);
  const cacheKey = buildSearchCacheKey([
    WEB_SEARCH_PROVIDER_ID,
    baseUrl,
    model,
    query,
    count,
  ]);
  const cached = readCachedSearchPayload(cacheKey);
  if (cached) return cached;

  const started = Date.now();
  try {
    const data = await requestOciResponsesWebSearch({
      query,
      count,
      apiKey,
      model,
      baseUrl,
      timeoutSeconds,
      signal: context?.signal,
    });
    const texts = collectOutputText(data).map((t) => t.trim()).filter(Boolean);
    const content = texts.join("\n\n").trim() ||
      "Nao consegui obter resultados atuais confiaveis na web no momento.";
    const payload = {
      query,
      provider: WEB_SEARCH_PROVIDER_ID,
      model,
      tookMs: Date.now() - started,
      externalContent: {
        untrusted: true,
        source: "web_search",
        provider: WEB_SEARCH_PROVIDER_ID,
        wrapped: true,
      },
      content: wrapWebContent(content),
      citations: collectCitations(data),
    };
    writeCachedSearchPayload(
      cacheKey,
      payload,
      resolveSearchCacheTtlMs(searchConfig?.cacheTtlMinutes ?? DEFAULT_CACHE_TTL_MINUTES),
    );
    return payload;
  } catch (error) {
    return {
      error: "oci_grok_web_search_failed",
      message: error instanceof Error ? error.message : String(error),
      provider: WEB_SEARCH_PROVIDER_ID,
      model,
    };
  }
}

function createOciGrokWebSearchProvider() {
  return {
    id: WEB_SEARCH_PROVIDER_ID,
    label: "OCI Grok Web Search",
    hint: "OCI Responses + xAI Grok web_search via custom plugin",
    onboardingScopes: ["text-inference"],
    credentialLabel: "OCI Responses API key",
    envVars: ["OCI_RESPONSES_API_KEY"],
    placeholder: "sk-...",
    docsUrl: "https://docs.openclaw.ai/tools/web",
    autoDetectOrder: 25,
    credentialPath: WEB_SEARCH_CREDENTIAL_PATH,
    ...createWebSearchProviderContractFields({
      credentialPath: WEB_SEARCH_CREDENTIAL_PATH,
      searchCredential: { type: "scoped", scopeId: WEB_SEARCH_PROVIDER_ID },
      configuredCredential: { pluginId: PROVIDER_ID },
    }),
    createTool: (ctx) => ({
      description:
        "Search the live web using OCI Responses with xAI Grok web_search. Returns a concise, grounded answer with citations when available.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query string.",
          },
          count: {
            type: "number",
            description: "Number of points/results to request, 1-10.",
            minimum: 1,
            maximum: 10,
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
      execute: async (args, context) => executeOciGrokWebSearch(ctx, args, context),
    }),
  };
}

export default definePluginEntry({
  id: PROVIDER_ID,
  name: "OCI Responses Grok Web",
  description: "OCI Responses provider for Grok with built-in web_search",
  register(api) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "OCI Responses Grok Web",
      docsPath: "/providers/oci-responses-grok-web",
      envVars: [
        "OCI_RESPONSES_API_KEY",
        "OCI_RESPONSES_REGION",
        "OCI_RESPONSES_PROJECT_OCID",
      ],

      ...RESPONSES_HOOKS,

      auth: [
        createProviderApiKeyAuthMethod({
          providerId: PROVIDER_ID,
          methodId: "api-key",
          label: "OCI Responses API key",
          hint: "OCI Generative AI / Enterprise AI API key",
          optionKey: "ociResponsesApiKey",
          flagName: "--oci-responses-api-key",
          envVar: "OCI_RESPONSES_API_KEY",
          promptMessage: "Enter your OCI Responses API key",
          defaultModel: `${PROVIDER_ID}/${MODEL_ID}`,
        }),
      ],

      catalog: {
        order: "simple",
        run: async () => {
          return {
            provider: {
              api: "openai-responses",
              baseUrl: getBaseUrl(),
              models: [buildModel()],
            },
          };
        },
      },

      resolveDynamicModel: (ctx) => {
        if (ctx.modelId !== MODEL_ID) return null;
        return buildModel();
      },

      prepareExtraParams: (ctx) => {
        if (ctx.modelId !== MODEL_ID) return {};
        return {
          tools: [{ type: "web_search" }],
          ...(useProjectMode() ? {} : { store: false }),
        };
      },

      resolveTransportTurnState: () => {
        if (!useProjectMode()) return {};
        return {
          headers: {
            "openai-project": process.env.OCI_RESPONSES_PROJECT_OCID,
          },
        };
      },
    });

    api.registerWebSearchProvider(createOciGrokWebSearchProvider());
  },
});
