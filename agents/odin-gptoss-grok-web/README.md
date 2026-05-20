# Agente Odin com Grok 4.1 Fast Reasoning e WebSearch

Este guia cria um agente inspirado no Odin para um deploy OpenClaw generico:

- LLM principal: `oci-grok41r-web`, alias para `oci-responses-grok-web/xai.grok-4-1-fast-reasoning`.
- Raciocinio: habilitado no cadastro do modelo do plugin.
- Tools: habilitadas via OCI Responses, incluindo `web_search`.
- Fallback/opcional: `oci-gptoss`, alias para `openai.gpt-oss-120b` via OCI Generative AI.
- Sem STT e sem TTS nesta versao.

Os comandos abaixo rodam no servidor OpenClaw como usuario `opc`.

## 1. Conferir pre-requisitos

```bash
openclaw --version
openclaw config validate
openclaw gateway status
openclaw models list --status-plain
```

Use OpenClaw `2026.5.4` ou superior.

## 2. Configurar credenciais no servico

Edite o arquivo de ambiente do Gateway:

```bash
cat > "$HOME/.openclaw/gateway.systemd.env" <<'EOF'
OPENAI_API_KEY=<sua-chave-para-o-endpoint-openai-compatible>
OPENAI_BASE_URL=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1

OCI_RESPONSES_API_KEY=<sua-chave-oci-responses>
OCI_RESPONSES_REGION=us-chicago-1
# OCI_RESPONSES_PROJECT_OCID=<opcional>
EOF

chmod 600 "$HOME/.openclaw/gateway.systemd.env"
openclaw gateway restart
```

Valide os modelos disponiveis:

```bash
openclaw models list --status-plain
```

Crie ou atualize os aliases:

```bash
openclaw models aliases add oci-grok41r-web \
  oci-responses-grok-web/xai.grok-4-1-fast-reasoning

openclaw models aliases add oci-gptoss \
  custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b

openclaw models set oci-grok41r-web
```

Se o seu tenancy retornar outros IDs, substitua os IDs acima pelos valores exatos retornados no `models list`.

## 3. Instalar o plugin Grok WebSearch

Copie a pasta do plugin deste repositorio para o servidor:

```bash
mkdir -p "$HOME/openclaw-plugins"
cp -R agents/odin-gptoss-grok-web/plugins/oci-responses-grok-web \
  "$HOME/openclaw-plugins/oci-responses-grok-web"
```

Se estiver executando a partir de um clone local do repositorio, primeiro envie a pasta para o servidor com `scp` ou `rsync`.

Instale o plugin no OpenClaw:

```bash
openclaw plugins install "$HOME/openclaw-plugins/oci-responses-grok-web" --force
openclaw plugins enable oci-responses-grok-web
openclaw config validate
openclaw gateway restart
```

Verifique se o provider de WebSearch foi carregado:

```bash
openclaw plugins list --json | grep -A 8 '"id": "oci-responses-grok-web"'
openclaw models list --status-plain
```

O modelo Grok via plugin deve aparecer como:

```text
oci-responses-grok-web/xai.grok-4-1-fast-reasoning
```

Crie um alias para ele:

```bash
openclaw models aliases add oci-grok41r-web \
  oci-responses-grok-web/xai.grok-4-1-fast-reasoning
```

## 4. Criar o workspace do agente

```bash
export ODIN_WORKSPACE="$HOME/.openclaw/workspace-odin"
export ODIN_AGENT_DIR="$HOME/.openclaw/agents/odin/agent"

mkdir -p "$ODIN_WORKSPACE" "$ODIN_AGENT_DIR"
cp agents/odin-gptoss-grok-web/workspace/IDENTITY.md "$ODIN_WORKSPACE/IDENTITY.md"
cp agents/odin-gptoss-grok-web/workspace/AGENTS.md "$ODIN_WORKSPACE/AGENTS.md"
```

Caso esteja seguindo manualmente, crie os arquivos com o conteudo dos exemplos desta pasta.

## 5. Registrar o agente no OpenClaw

```bash
openclaw agents add odin \
  --workspace "$ODIN_WORKSPACE" \
  --agent-dir "$ODIN_AGENT_DIR" \
  --model oci-grok41r-web \
  --non-interactive \
  --json

openclaw agents set-identity \
  --agent odin \
  --identity-file "$ODIN_WORKSPACE/IDENTITY.md" \
  --json
```

Depois aplique a configuracao de ferramentas. O perfil abaixo libera `web_search`, mantem execucao minima e desliga verbose por padrao para evitar respostas intermediarias em excesso.

```bash
openclaw config patch --stdin < agents/odin-gptoss-grok-web/config/agent-config.patch.json5
openclaw config validate
openclaw gateway restart
```

Se o agente tiver outro ID, edite `agent-config.patch.json5` antes de aplicar.

## 6. Testar o agente sem entregar em canal

Teste o modelo principal:

```bash
openclaw agent \
  --agent odin \
  --message "Responda em uma frase: qual modelo principal voce esta usando?" \
  --json
```

Teste WebSearch:

```bash
openclaw agent \
  --agent odin \
  --message "Use web_search para verificar uma noticia atual sobre OCI Generative AI e responda com fonte." \
  --json
```

Teste uma chamada forçando o modelo Grok web como modelo da rodada, apenas para isolar o plugin:

```bash
openclaw agent \
  --agent odin \
  --model oci-grok41r-web \
  --message "Use a busca web para responder: qual e a data de hoje? Cite a fonte." \
  --json
```

## 7. Vincular a um canal

Para WhatsApp:

```bash
openclaw channels login --channel whatsapp --verbose
openclaw channels status --deep
openclaw agents bind --agent odin --bind whatsapp --json
```

Envio de teste:

```bash
openclaw agent \
  --agent odin \
  --channel whatsapp \
  --to +5511999999999 \
  --message "Odin, faca um status curto do sistema." \
  --deliver
```

## 8. Operacao

Comandos de rotina:

```bash
openclaw agents list --json
openclaw gateway status
openclaw channels status --deep
openclaw plugins list
openclaw logs
journalctl --user -u openclaw-gateway.service -f
```

## 9. Observacoes

- Esta versao nao configura STT nem TTS.
- O plugin usa `OCI_RESPONSES_API_KEY` e `OCI_RESPONSES_REGION`; mantenha essas variaveis no `gateway.systemd.env`.
- O provider de WebSearch registrado pelo plugin se chama `oci-grok-web`.
- O modelo exposto pelo plugin se chama `oci-responses-grok-web/xai.grok-4-1-fast-reasoning`.
- O alias `oci-grok41r-web` e o modelo principal do agente neste deploy.
- Se o OpenClaw nao encontrar o provider, rode `openclaw plugins install ... --force`, reinicie o gateway e valide com `openclaw plugins list`.
