# OpenClaw em OCI

Este repositorio documenta uma instalacao reprodutivel do OpenClaw em Oracle Cloud Infrastructure (OCI), baseada no ambiente mapeado no servidor `langfuse_server`.

O objetivo e criar uma VM Oracle Linux para executar o OpenClaw Gateway como servico `systemd --user`, manter o gateway exposto apenas em `127.0.0.1:18789`, configurar modelos via OCI Generative AI e preparar o ambiente para agentes conectados a canais como WhatsApp.

## Conteudo

- [Arquitetura de referencia](#arquitetura-de-referencia)
- [Pre-requisitos](#pre-requisitos)
- [Criar a infraestrutura na OCI](#criar-a-infraestrutura-na-oci)
- [Preparar o servidor Oracle Linux](#preparar-o-servidor-oracle-linux)
- [Instalar o OpenClaw](#instalar-o-openclaw)
- [Configurar credenciais e modelos](#configurar-credenciais-e-modelos)
- [Instalar o Gateway como servico](#instalar-o-gateway-como-servico)
- [Configurar canais](#configurar-canais)
- [Opcional: UI e Nginx](#opcional-ui-e-nginx)
- [Operacao e validacao](#operacao-e-validacao)
- [Criar um agente tipo Odin](#criar-um-agente-tipo-odin)

## Arquitetura de referencia

Estado observado no servidor atual:

| Item | Valor de referencia |
| --- | --- |
| Sistema operacional | Oracle Linux 9.x |
| Usuario de execucao | `opc` |
| OpenClaw CLI | `2026.5.4` |
| Instalacao npm global | `/home/opc/.npm-global` |
| Estado OpenClaw | `/home/opc/.openclaw` |
| Workspace padrao | `/home/opc/.openclaw/workspace` |
| Gateway | `127.0.0.1:18789` |
| Servico Gateway | `/home/opc/.config/systemd/user/openclaw-gateway.service` |
| Plugins locais | `/home/opc/openclaw-plugins` e `/home/opc/.openclaw/extensions` |
| UI opcional | `127.0.0.1:8000`, publicada em `/openclaw-ui/` via Nginx |

Fluxo resumido:

```text
Usuario/canal -> OpenClaw Gateway -> Agente -> LLM OCI/gpt-oss
                                      |
                                      +-> tool web_search via Grok/OCI Responses
```

Por padrao, nao exponha a porta `18789` diretamente para a internet. Use loopback, SSH tunnel, Nginx autenticado ou outra camada de acesso controlado.

## Pre-requisitos

Na maquina local de administracao:

- OCI CLI configurado com acesso ao tenancy.
- Chave SSH publica para acessar a VM como `opc`.
- Permissoes para criar VCN, subnet, internet gateway, security list e compute instance.
- OCID do compartment.
- API key ou endpoint compativel com OpenAI para OCI Generative AI, com acesso ao modelo `openai.gpt-oss-120b`.
- API key para OCI Responses/xAI Grok caso queira habilitar web search via Grok.

No servidor:

- Oracle Linux 9.
- Acesso SSH como `opc`.
- Saida HTTPS liberada para npm, GitHub, OCI Generative AI e provedores de canal.

## Criar a infraestrutura na OCI

Os comandos abaixo rodam na sua maquina local, com `oci` CLI autenticado. Ajuste os OCIDs, regiao, shape e chave SSH antes de executar.

```bash
export OCI_CLI_PROFILE=DEFAULT
export REGION="us-chicago-1"
export COMPARTMENT_OCID="ocid1.compartment.oc1..example"
export PREFIX="openclaw"
export SSH_PUBLIC_KEY_FILE="$HOME/.ssh/id_rsa.pub"
export SHAPE="VM.Standard.E5.Flex"
export VCN_CIDR="10.20.0.0/16"
export SUBNET_CIDR="10.20.10.0/24"

oci setup repair-file-permissions --file "$HOME/.oci/config"
oci iam availability-domain list \
  --compartment-id "$COMPARTMENT_OCID" \
  --query 'data[0].name' \
  --raw-output
export AD="<availability-domain-retornado>"
```

Crie rede publica minima para SSH, HTTP e HTTPS:

```bash
VCN_ID=$(oci network vcn create \
  --compartment-id "$COMPARTMENT_OCID" \
  --display-name "$PREFIX-vcn" \
  --cidr-block "$VCN_CIDR" \
  --dns-label "openclaw" \
  --query 'data.id' \
  --raw-output)

IGW_ID=$(oci network internet-gateway create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-igw" \
  --is-enabled true \
  --query 'data.id' \
  --raw-output)

RT_ID=$(oci network route-table create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-public-rt" \
  --route-rules "[{\"cidrBlock\":\"0.0.0.0/0\",\"networkEntityId\":\"$IGW_ID\"}]" \
  --query 'data.id' \
  --raw-output)

SL_ID=$(oci network security-list create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-public-sl" \
  --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all"}]' \
  --ingress-security-rules "[{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":22,\"max\":22}}},{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":80,\"max\":80}}},{\"source\":\"0.0.0.0/0\",\"protocol\":\"6\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":443,\"max\":443}}}]" \
  --query 'data.id' \
  --raw-output)

SUBNET_ID=$(oci network subnet create \
  --compartment-id "$COMPARTMENT_OCID" \
  --vcn-id "$VCN_ID" \
  --display-name "$PREFIX-public-subnet" \
  --cidr-block "$SUBNET_CIDR" \
  --route-table-id "$RT_ID" \
  --security-list-ids "[\"$SL_ID\"]" \
  --prohibit-public-ip-on-vnic false \
  --dns-label "public" \
  --query 'data.id' \
  --raw-output)
```

Escolha a imagem Oracle Linux 9 mais recente para o shape:

```bash
IMAGE_OCID=$(oci compute image list \
  --compartment-id "$COMPARTMENT_OCID" \
  --operating-system "Oracle Linux" \
  --operating-system-version "9" \
  --shape "$SHAPE" \
  --sort-by TIMECREATED \
  --sort-order DESC \
  --all \
  --query 'data[0].id' \
  --raw-output)
```

Crie a instancia:

```bash
INSTANCE_ID=$(oci compute instance launch \
  --availability-domain "$AD" \
  --compartment-id "$COMPARTMENT_OCID" \
  --display-name "$PREFIX-vm" \
  --shape "$SHAPE" \
  --shape-config '{"ocpus":2,"memoryInGBs":16}' \
  --subnet-id "$SUBNET_ID" \
  --image-id "$IMAGE_OCID" \
  --assign-public-ip true \
  --ssh-authorized-keys-file "$SSH_PUBLIC_KEY_FILE" \
  --query 'data.id' \
  --raw-output)

oci compute instance get \
  --instance-id "$INSTANCE_ID" \
  --query 'data."lifecycle-state"' \
  --raw-output
```

Depois que a instancia estiver `RUNNING`, obtenha o IP publico:

```bash
PUBLIC_IP=$(oci compute instance list-vnics \
  --instance-id "$INSTANCE_ID" \
  --query 'data[0]."public-ip"' \
  --raw-output)

ssh opc@"$PUBLIC_IP"
```

## Preparar o servidor Oracle Linux

Daqui em diante, os comandos rodam dentro da VM OCI como usuario `opc`.

Atualize pacotes e instale utilitarios:

```bash
sudo dnf update -y
sudo dnf install -y git curl jq unzip tar firewalld
sudo systemctl enable --now firewalld

sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

Instale Node.js 22 via NodeSource. O ambiente de referencia usa o `node` de `/usr/bin/node` no servico systemd.

```bash
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs

node --version
npm --version
```

Configure o prefixo global do npm no home do usuario:

```bash
mkdir -p "$HOME/.npm-global" "$HOME/bin" "$HOME/.openclaw"
npm config set prefix "$HOME/.npm-global"

grep -q '.npm-global/bin' "$HOME/.bashrc" || cat >> "$HOME/.bashrc" <<'EOF'
export PATH="$HOME/.npm-global/bin:$HOME/bin:$PATH"
EOF

source "$HOME/.bashrc"
```

## Instalar o OpenClaw

```bash
npm install -g openclaw@latest
openclaw --version
openclaw setup
openclaw config validate
```

O `setup` cria a estrutura principal:

```text
/home/opc/.openclaw/
  openclaw.json
  workspace/
  agents/
  extensions/
  npm/
```

Crie diretorios auxiliares usados na instalacao atual:

```bash
mkdir -p "$HOME/openclaw-plugins"
mkdir -p "$HOME/.openclaw/workspace"
mkdir -p "$HOME/.openclaw/agents"
```

## Configurar credenciais e modelos

Crie um arquivo de ambiente para o Gateway. Nao commite esse arquivo em Git.

```bash
cat > "$HOME/.openclaw/gateway.systemd.env" <<'EOF'
# OCI Generative AI / endpoint OpenAI-compatible
OPENAI_API_KEY=<sua-chave-para-o-endpoint-openai-compatible>
OPENAI_BASE_URL=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1

# OCI Responses usado pelo plugin Grok web search
OCI_RESPONSES_API_KEY=<sua-chave-oci-responses>
OCI_RESPONSES_REGION=us-chicago-1

# Opcional quando usar Enterprise AI Agents / projeto OCI
# OCI_RESPONSES_PROJECT_OCID=<ocid-do-projeto>
EOF

chmod 600 "$HOME/.openclaw/gateway.systemd.env"
```

Valide os modelos descobertos:

```bash
openclaw models list --status-plain
```

No ambiente de referencia, o modelo principal aparece como:

```text
custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b
```

Crie aliases para facilitar a manutencao:

```bash
openclaw models aliases add oci-gptoss \
  custom-inference-generativeai-us-chicago-1-oci-oraclecloud-com/openai.gpt-oss-120b

openclaw models set oci-gptoss
openclaw models list --status-plain
```

Se o ID do modelo for diferente no seu tenancy, use o valor retornado por `openclaw models list --status-plain`.

## Instalar o Gateway como servico

Habilite servicos de usuario mesmo sem uma sessao SSH ativa:

```bash
sudo loginctl enable-linger opc
```

Instale e inicie o Gateway na porta observada no ambiente atual:

```bash
openclaw gateway install --port 18789 --runtime node --force
openclaw gateway start

systemctl --user status openclaw-gateway.service --no-pager
openclaw gateway status
openclaw health
```

Se estiver operando sem sessao interativa, use `XDG_RUNTIME_DIR`:

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
journalctl --user -u openclaw-gateway.service -f
```

O servico esperado fica parecido com:

```ini
[Service]
ExecStart=/usr/bin/node /home/opc/.npm-global/lib/node_modules/openclaw/dist/index.js gateway --port 18789
EnvironmentFile=-/home/opc/.openclaw/gateway.systemd.env
Environment=OPENCLAW_GATEWAY_PORT=18789
```

## Configurar canais

Para WhatsApp, instale ou habilite o plugin de canal se ainda nao estiver presente e rode o login:

```bash
openclaw plugins list
openclaw channels login --channel whatsapp --verbose
openclaw channels status --deep
```

Depois, teste uma rodada local do agente:

```bash
openclaw agent --message "Responda apenas: OpenClaw operacional." --json
```

Para entregar uma resposta em um canal:

```bash
openclaw agent \
  --channel whatsapp \
  --to +5511999999999 \
  --message "Faça um resumo do status do sistema." \
  --deliver
```

## Opcional: UI e Nginx

O servidor mapeado tambem possui uma UI Python em `127.0.0.1:8000`, publicada pelo Nginx no caminho `/openclaw-ui/`.

Servico de referencia:

```ini
[Unit]
Description=AI Agent Demo UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=opc
Group=opc
WorkingDirectory=/opt/ai-agent-demo-ui/current
EnvironmentFile=/etc/ai-agent-demo-ui/app.env
ExecStart=/opt/ai-agent-demo-ui/current/.venv/bin/python -m app.server --host 127.0.0.1 --port 8000
Restart=on-failure
ReadWritePaths=/tmp /var/tmp /home/opc/.openclaw

[Install]
WantedBy=multi-user.target
```

Bloco Nginx de referencia:

```nginx
location = /openclaw-ui {
  return 301 /openclaw-ui/;
}

location /openclaw-ui/ {
  proxy_pass http://127.0.0.1:8000/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Prefix /openclaw-ui;
  proxy_read_timeout 120s;
}
```

Instalacao basica do Nginx:

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo nginx -t
sudo systemctl reload nginx
```

Para HTTPS, aponte o DNS do dominio para o IP publico da VM e use Certbot:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.example.com
```

## Operacao e validacao

Comandos uteis no dia a dia:

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

Reinicio controlado:

```bash
openclaw gateway restart
openclaw gateway status
```

Atualizacao:

```bash
npm install -g openclaw@latest
openclaw config validate
openclaw gateway restart
openclaw --version
```

Backup local antes de mudancas maiores:

```bash
openclaw backup create
tar -czf "$HOME/openclaw-state-$(date +%Y%m%d-%H%M%S).tgz" \
  "$HOME/.openclaw/openclaw.json" \
  "$HOME/.openclaw/workspace" \
  "$HOME/.openclaw/agents" \
  "$HOME/.openclaw/extensions"
```

## Criar um agente tipo Odin

O passo a passo completo para criar um agente inspirado no Odin, usando GPT-OSS como LLM principal e Grok como ferramenta de WebSearch, esta em:

[agents/odin-gptoss-grok-web/README.md](agents/odin-gptoss-grok-web/README.md)

Essa subpasta inclui tambem um plugin compartilhavel baseado no servidor atual:

[agents/odin-gptoss-grok-web/plugins/oci-responses-grok-web](agents/odin-gptoss-grok-web/plugins/oci-responses-grok-web)

## Cuidados de seguranca

- Nunca commite `~/.openclaw/openclaw.json`, `gateway.systemd.env`, tokens, arquivos OAuth ou caches de sessao.
- Mantenha o Gateway em loopback, salvo quando houver proxy autenticado e TLS.
- Restrinja SSH por IP sempre que possivel.
- Use `chmod 600` nos arquivos com chaves.
- Rotacione tokens que tenham sido compartilhados fora de um cofre de segredos.
