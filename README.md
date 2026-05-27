# OpenClaw em OCI

Este repositorio documenta um deploy generico de OpenClaw em Oracle Cloud Infrastructure (OCI), com foco em uma VM Oracle Linux executando o OpenClaw Gateway como servico `systemd --user`.

O perfil padrao deste deploy usa **Grok 4.1 Fast Reasoning com suporte a tools** como modelo principal, via plugin `oci-responses-grok-web`. O GPT-OSS via OCI Generative AI fica documentado como modelo alternativo/fallback.

## Conteudo

- [Exemplo de servidor](#exemplo-de-servidor)
- [Modelo principal do deploy](#modelo-principal-do-deploy)
- [Pre-requisitos](#pre-requisitos)
- [Instalacao no servidor](#instalacao-no-servidor)
- [Credenciais e modelos](#credenciais-e-modelos)
- [Gateway como servico](#gateway-como-servico)
- [Canais](#canais)
- [Operacao](#operacao)
- [Infra OCI via CLI](#infra-oci-via-cli)
- [Terraform para trial/ambiente novo](#terraform-para-trialambiente-novo)
- [Pos-deploy apos acesso SSH](#pos-deploy-apos-acesso-ssh)
- [Agente Odin](#agente-odin)

## Exemplo de servidor

| Item | Valor de exemplo |
| --- | --- |
| Sistema operacional | Oracle Linux 9.x |
| Usuario de execucao | `opc` |
| OpenClaw CLI | `2026.5.4` ou superior |
| Instalacao npm global | `/home/opc/.npm-global` |
| Estado OpenClaw | `/home/opc/.openclaw` |
| Workspace padrao | `/home/opc/.openclaw/workspace` |
| Gateway | `127.0.0.1:18789` |
| Servico Gateway | `/home/opc/.config/systemd/user/openclaw-gateway.service` |
| Plugins locais | `/home/opc/openclaw-plugins` e `/home/opc/.openclaw/extensions` |

Fluxo recomendado:

```text
Usuario/canal -> OpenClaw Gateway -> Agente -> Grok 4.1 Fast Reasoning
                                      |
                                      +-> tools, incluindo web_search
```

Mantenha o Gateway em loopback (`127.0.0.1`). Para acesso externo, use SSH tunnel, VPN, Nginx autenticado ou outra camada controlada.

## Modelo principal do deploy

Padrao deste repositorio:

| Papel | Alias | Modelo |
| --- | --- | --- |
| Principal | `oci-grok41r-web` | `oci-responses-grok-web/xai.grok-4-1-fast-reasoning` |
| Fallback/opcional | `oci-gptoss` | `custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b` |

O plugin `oci-responses-grok-web` registra:

- provider de modelo: `oci-responses-grok-web`;
- provider de WebSearch: `oci-grok-web`;
- modelo padrao: `xai.grok-4-1-fast-reasoning`;
- suporte a `tools: [{ type: "web_search" }]` via OCI Responses.

## Pre-requisitos

Na maquina local de administracao:

- Acesso SSH a uma VM Oracle Linux 9, ou permissao para criar uma VM na OCI.
- Chave SSH publica para o usuario `opc`.
- API key para OCI Responses / endpoint OpenAI-compatible com acesso ao modelo Grok.
- Opcional: acesso ao modelo GPT-OSS via OCI Generative AI.

No servidor:

- Saida HTTPS liberada para npm, GitHub, OCI Generative AI e provedores de canal.
- Portas 22, 80 e 443 liberadas apenas se forem necessarias para SSH/Nginx/certificados.

## Instalacao no servidor

Os comandos abaixo rodam dentro da VM como `opc`.

```bash
sudo dnf update -y
sudo dnf install -y git curl jq unzip tar firewalld
sudo systemctl enable --now firewalld

sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

Instale Node.js 22:

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
node --version
npm --version
```

Configure npm global no home do usuario:

```bash
mkdir -p "$HOME/.npm-global" "$HOME/bin" "$HOME/.openclaw" "$HOME/openclaw-plugins"
npm config set prefix "$HOME/.npm-global"

grep -q '.npm-global/bin' "$HOME/.bashrc" || cat >> "$HOME/.bashrc" <<'EOF'
export PATH="$HOME/.npm-global/bin:$HOME/bin:$PATH"
EOF

source "$HOME/.bashrc"
```

Instale o OpenClaw:

```bash
npm install -g openclaw@latest
openclaw --version
openclaw setup --non-interactive
openclaw config validate
```

## Credenciais e modelos

Crie o arquivo de ambiente do Gateway. Nao commite esse arquivo.

```bash
cat > "$HOME/.openclaw/gateway.systemd.env" <<'EOF'
OCI_RESPONSES_API_KEY=<sua-chave-oci-responses>
OCI_RESPONSES_REGION=us-chicago-1

# Opcional: use quando o seu endpoint GPT-OSS exigir compatibilidade OpenAI.
# OPENAI_API_KEY=<sua-chave-openai-compatible>
# OPENAI_BASE_URL=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1

# Opcional: quando usar projeto OCI/Enterprise AI Agents.
# OCI_RESPONSES_PROJECT_OCID=<ocid-do-projeto>
EOF

chmod 600 "$HOME/.openclaw/gateway.systemd.env"
```

Instale o plugin Grok + WebSearch deste repositorio:

```bash
cp -R agents/odin-gptoss-grok-web/plugins/oci-responses-grok-web \
  "$HOME/openclaw-plugins/oci-responses-grok-web"

openclaw plugins install "$HOME/openclaw-plugins/oci-responses-grok-web" --force
openclaw plugins enable oci-responses-grok-web
openclaw config validate
```

Configure aliases:

```bash
openclaw models aliases add oci-grok41r-web \
  oci-responses-grok-web/xai.grok-4-1-fast-reasoning

openclaw models aliases add oci-gptoss \
  custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b

openclaw models set oci-grok41r-web
openclaw models list --status-plain
```

Se o seu tenancy retornar IDs diferentes, use os IDs exibidos em `openclaw models list --status-plain`.

## Gateway como servico

```bash
sudo loginctl enable-linger opc

openclaw gateway install --port 18789 --runtime node --force
openclaw gateway start

systemctl --user status openclaw-gateway.service --no-pager
openclaw gateway status
openclaw health
```

Em sessoes nao interativas:

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
journalctl --user -u openclaw-gateway.service -f
```

## Canais

Exemplo com WhatsApp:

```bash
openclaw plugins list
openclaw channels login --channel whatsapp --verbose
openclaw channels status --deep
```

Teste local sem entrega:

```bash
openclaw agent \
  --model oci-grok41r-web \
  --message "Use web_search para validar uma informacao atual e responda com fonte." \
  --json
```

Entrega em canal:

```bash
openclaw agent \
  --channel whatsapp \
  --to +5511999999999 \
  --message "Faca um resumo curto do status do sistema." \
  --deliver
```

## Operacao

```bash
openclaw --version
openclaw config validate
openclaw gateway status
openclaw health
openclaw channels status --deep
openclaw models list --status-plain
openclaw plugins list
```

Logs:

```bash
journalctl --user -u openclaw-gateway.service -n 200 --no-pager
journalctl --user -u openclaw-gateway.service -f
openclaw logs
```

Atualizacao:

```bash
npm install -g openclaw@latest
openclaw config validate
openclaw gateway restart
openclaw --version
```

Backup antes de mudancas:

```bash
openclaw backup create
tar -czf "$HOME/openclaw-state-$(date +%Y%m%d-%H%M%S).tgz" \
  "$HOME/.openclaw/openclaw.json" \
  "$HOME/.openclaw/workspace" \
  "$HOME/.openclaw/agents" \
  "$HOME/.openclaw/extensions"
```

## Infra OCI via CLI

A criacao manual da infraestrutura OCI via CLI:

[infra/oci-infra.md](infra/oci-infra.md)

Use esse arquivo quando quiser criar VCN, subnet publica, security list e VM manualmente ou via OCI CLI. O README principal assume que a VM ja existe.

## Terraform para trial/ambiente novo

Um Terraform completo para criar uma infra nova de trial e executar o maximo possivel do bootstrap via cloud-init esta em:

[infra/terraform/oci-trial-deploy/README.md](infra/terraform/oci-trial-deploy/README.md)

Ele cria:

- VCN;
- Internet Gateway;
- Route Table;
- Security List;
- Subnet publica;
- VM Oracle Linux 9;
- bootstrap com Node.js, OpenClaw, plugin Grok WebSearch, agente Odin e servico Gateway.

As credenciais de LLM nao sao gravadas no Terraform state. O bootstrap cria arquivos de exemplo e deixa o servidor pronto para receber as chaves via SSH depois do `terraform apply`.

Depois que a VM estiver criada e o acesso SSH estiver funcionando, continue pelo guia de pos-deploy:

[infra/terraform/oci-trial-deploy/POST_DEPLOY.md](infra/terraform/oci-trial-deploy/POST_DEPLOY.md)

Esse guia cobre os passos que ainda precisam ser feitos dentro do servidor:

- confirmar que o `cloud-init` terminou;
- validar a instalacao do OpenClaw;
- preencher `~/.openclaw/gateway.systemd.env` com as chaves;
- reiniciar e validar o Gateway;
- testar o modelo principal, o agente `odin` e a tool `web_search`;
- autenticar na Control UI com o token do Gateway;
- abrir tunel SSH para acessar `ws://127.0.0.1:18789` a partir da maquina local.
- opcionalmente instalar um LaunchAgent no macOS para recriar o tunel SSH automaticamente depois que o micro acordar.

## Pos-deploy apos acesso SSH

O Terraform entrega a infraestrutura e instala o OpenClaw, mas as credenciais de LLM devem ser configuradas depois do primeiro SSH. O checklist oficial esta em:

[infra/terraform/oci-trial-deploy/POST_DEPLOY.md](infra/terraform/oci-trial-deploy/POST_DEPLOY.md)

Resumo do fluxo:

```bash
ssh <alias-da-vm>
sudo cloud-init status --long
sudo tail -n 120 /var/log/cloud-init-output.log

source "$HOME/.bashrc"
openclaw --version
openclaw config validate
openclaw gateway status

nano "$HOME/.openclaw/gateway.systemd.env"
chmod 600 "$HOME/.openclaw/gateway.systemd.env"
openclaw gateway restart

openclaw agent --agent odin --message "Use web_search para trazer uma fonte atual." --json
```

Para a Control UI, se aparecer `Auth required`, configure um `OPENCLAW_GATEWAY_TOKEN` no `~/.openclaw/gateway.systemd.env` e use esse valor no campo `Gateway Token` ou no fragmento `#token=...` da URL. Em SSH/headless, `openclaw config get gateway.auth.token` pode retornar `__OPENCLAW_REDACTED__`, e isso e esperado.

Se o Mac hibernar, o Gateway no servidor continua ativo, mas o tunel SSH local cai. O guia [POST_DEPLOY.md](infra/terraform/oci-trial-deploy/POST_DEPLOY.md) inclui um LaunchAgent de macOS para recriar automaticamente o tunel `127.0.0.1:18789 -> servidor:18789` ao iniciar a sessao ou depois de uma queda.

O Terraform pode receber variaveis nao secretas antes do `apply`, como regiao, porta, modelo, `oci_responses_project_ocid` e `openai_base_url`. Ja chaves como `OCI_RESPONSES_API_KEY`, `OPENAI_API_KEY` e tokens de provedores devem ficar fora do Terraform para nao entrarem em state, metadados da instancia ou historico do Resource Manager.

## Agente Odin

O passo a passo do agente inspirado no Odin esta em:

[agents/odin-gptoss-grok-web/README.md](agents/odin-gptoss-grok-web/README.md)

Nesta versao, o agente nasce com `oci-grok41r-web` como modelo principal e com `web_search` liberado. STT e TTS ficam fora do escopo.

## Cuidados de seguranca

- Nunca commite `~/.openclaw/openclaw.json`, `gateway.systemd.env`, tokens, arquivos OAuth ou caches de sessao.
- Nao exponha `18789` diretamente para a internet.
- Restrinja SSH por IP sempre que possivel.
- Use `chmod 600` nos arquivos com chaves.
- Rotacione tokens que tenham sido compartilhados fora de um cofre de segredos.
