# Especificacao de Exemplo

Este arquivo resume um perfil de servidor OpenClaw em OCI que pode ser usado como referencia para novos ambientes. Ele nao contem segredos.

## Servidor

| Item | Valor de exemplo |
| --- | --- |
| Plataforma | Oracle Cloud Infrastructure |
| Sistema operacional | Oracle Linux 9.x |
| Usuario | `opc` |
| Home | `/home/opc` |
| OpenClaw CLI | `2026.5.4` ou superior |
| Node usado pelo servico | `/usr/bin/node` |
| Prefixo npm global | `/home/opc/.npm-global` |
| Gateway | `127.0.0.1:18789` |
| Workspace principal | `/home/opc/.openclaw/workspace` |

## Servico Gateway

Unidade:

```text
/home/opc/.config/systemd/user/openclaw-gateway.service
```

Execucao:

```text
/usr/bin/node /home/opc/.npm-global/lib/node_modules/openclaw/dist/index.js gateway --port 18789
```

Ambiente:

```text
/home/opc/.openclaw/gateway.systemd.env
```

## Modelos e aliases recomendados

| Alias | Papel | Modelo |
| --- | --- | --- |
| `oci-grok41r-web` | Principal | `oci-responses-grok-web/xai.grok-4-1-fast-reasoning` |
| `oci-gptoss` | Fallback/opcional | `custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b` |

## Plugins relevantes

| Plugin | Uso |
| --- | --- |
| `oci-responses-grok-web` | Provider OCI Responses para Grok 4.1 Fast Reasoning com suporte a tools gerenciadas pelo OpenClaw |
| `duckduckgo` | Provider bundled selecionado para a tool `web_search` |
| `whatsapp` | Canal WhatsApp |
| `diagnostics-otel` | Diagnosticos OpenTelemetry |

## UI opcional

| Item | Valor de exemplo |
| --- | --- |
| Servico | `ai-agent-demo-ui.service` |
| Working directory | `/opt/ai-agent-demo-ui/current` |
| Bind | `127.0.0.1:8000` |
| Nginx path | `/openclaw-ui/` |

## Arquivos que nao devem ir para Git

- `/home/opc/.openclaw/openclaw.json`
- `/home/opc/.openclaw/gateway.systemd.env`
- arquivos OAuth, tokens, caches de canal e sessoes
- backups com dados pessoais ou historico de conversas
