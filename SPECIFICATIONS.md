# Especificacao do Ambiente de Referencia

Este arquivo resume o estado usado como base para a documentacao do repositorio. Ele nao contem segredos.

## Servidor

| Item | Valor observado |
| --- | --- |
| Plataforma | Oracle Cloud Infrastructure |
| Sistema operacional | Oracle Linux 9.x |
| Usuario | `opc` |
| Home | `/home/opc` |
| OpenClaw CLI | `2026.5.4` |
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

## Modelos e aliases observados

| Alias | Modelo |
| --- | --- |
| `oci-gptoss` | `custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b` |
| `oci-grok41r` | `custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/xai.grok-4-1-fast-reasoning` |
| `oci-grok41r-web` | `oci-responses-grok-web/xai.grok-4-1-fast-reasoning` |

## Plugins relevantes

| Plugin | Uso |
| --- | --- |
| `oci-responses-grok-web` | Provider OCI Responses para Grok e provider `web_search` `oci-grok-web` |
| `whatsapp` | Canal WhatsApp |
| `whatsapp-delivery-guard` | Guarda local para reduzir entregas duplicadas em WhatsApp |
| `diagnostics-otel` | Diagnosticos OpenTelemetry |

## UI opcional

| Item | Valor observado |
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
