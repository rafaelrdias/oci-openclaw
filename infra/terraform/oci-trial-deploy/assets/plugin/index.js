import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth";
import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
import { buildProviderStreamFamilyHooks } from "openclaw/plugin-sdk/provider-stream";

const PROVIDER_ID = "oci-responses-grok-web";
const MODEL_ID = "xai.grok-4-1-fast-reasoning";
const REGION = process.env.OCI_RESPONSES_REGION || "us-chicago-1";

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
    name: "OCI xAI Grok 4.1 Fast Reasoning",
    provider: PROVIDER_ID,
    api: "openai-responses",
    baseUrl: getBaseUrl(),
    reasoning: { effort: "medium" },
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

export default definePluginEntry({
  id: PROVIDER_ID,
  name: "OCI Responses Grok",
  description:
    "OCI Responses provider for Grok 4.1 Fast Reasoning. Configure web_search with a separate OpenClaw provider such as DuckDuckGo.",
  register(api) {
    api.registerProvider({
      id: PROVIDER_ID,
      label: "OCI Responses Grok",
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
        if (ctx.modelId !== MODEL_ID || useProjectMode()) return {};
        return { store: false };
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
  },
});
