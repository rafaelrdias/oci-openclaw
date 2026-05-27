# Pos-deploy: configurar e validar OpenClaw

Use este guia depois que a stack Terraform terminar o `apply` e voce conseguir acessar a VM por SSH.

## 1. Acesse a VM

Use o output `ssh_config_entry` para criar um alias no seu `~/.ssh/config` ou conecte com o comando direto:

```bash
ssh -i "$HOME/.ssh/openclaw_trial" opc@<public_ip>
```

## 2. Confirme que o bootstrap terminou

```bash
sudo cloud-init status --long
sudo tail -n 120 /var/log/cloud-init-output.log
```

O `cloud-init status` deve terminar como `status: done`. Se ainda estiver em execucao, acompanhe:

```bash
sudo tail -f /var/log/cloud-init-output.log
```

## 3. Confira a instalacao base

```bash
source "$HOME/.bashrc"
openclaw --version
openclaw config validate
openclaw plugins list
openclaw models list --status-plain
openclaw agents list --json
openclaw gateway status
```

O modelo principal esperado e o alias `oci-grok41r-web`, apontando para `oci-responses-grok-web/xai.grok-4-1-fast-reasoning`. O agente esperado e `odin`.

## 4. Configure as credenciais

Edite o arquivo de ambiente do gateway:

```bash
nano "$HOME/.openclaw/gateway.systemd.env"
chmod 600 "$HOME/.openclaw/gateway.systemd.env"
```

Conteudo minimo:

```bash
OCI_RESPONSES_REGION=us-chicago-1
OCI_RESPONSES_API_KEY=<sua-chave-oci-responses>
```

Campos opcionais:

```bash
OCI_RESPONSES_PROJECT_OCID=<ocid-do-projeto>
OPENAI_BASE_URL=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1
OPENAI_API_KEY=<chave-openai-compatible-opcional>
```

Nao coloque essas chaves no Git e nao compartilhe o arquivo `gateway.systemd.env`.

## 5. Reinicie o gateway

```bash
openclaw gateway restart
openclaw gateway status
```

Se precisar ver logs:

```bash
journalctl --user -u openclaw-gateway.service -n 120 --no-pager
journalctl --user -u openclaw-gateway.service -f
```

## 6. Teste modelo, agente e web_search

```bash
openclaw models list --status-plain
openclaw agent --agent odin --message "Responda em uma frase se o gateway esta ativo." --json
openclaw agent --agent odin --message "Use web_search para trazer uma fonte atual sobre OCI Generative AI." --json
```

## 7. Acesse o gateway localmente

O gateway escuta apenas em `127.0.0.1` dentro da VM. Para acessar a partir da sua maquina, abra um tunel SSH:

```bash
ssh -N -L 18789:127.0.0.1:18789 <alias-ssh>
```

Depois use:

```text
ws://127.0.0.1:18789
```

## 8. Acesse a Control UI

A Control UI abre em:

```text
http://127.0.0.1:18789/
```

Se a tela mostrar `Auth required`, o Gateway esta acessivel, mas precisa do token ou senha configurada.

Em servidores acessados por SSH, `openclaw dashboard --no-open` pode nao conseguir copiar a URL tokenizada para a area de transferencia, e `openclaw config get gateway.auth.token` pode retornar `__OPENCLAW_REDACTED__`. Isso e esperado: o CLI mascara campos secretos.

Use um token em variavel de ambiente do servico, referenciado pela configuracao do OpenClaw:

```bash
TOKEN="$(openssl rand -hex 32)"
ENV_FILE="$HOME/.openclaw/gateway.systemd.env"

grep -v '^OPENCLAW_GATEWAY_TOKEN=' "$ENV_FILE" > "$ENV_FILE.tmp"
printf 'OPENCLAW_GATEWAY_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token \
  --ref-provider default \
  --ref-source env \
  --ref-id OPENCLAW_GATEWAY_TOKEN
openclaw gateway restart

printf '\nControl UI: http://127.0.0.1:18789/#token=%s\n' "$TOKEN"
```

Abra a URL impressa no final ou copie somente o valor de `TOKEN` para o campo `Gateway Token` da UI.

O formato da URL tokenizada e:

```text
http://127.0.0.1:18789/#token=<gateway-token>
```

Tambem e possivel usar o helper:

```bash
openclaw dashboard --no-open
```

Em ambientes com desktop/clipboard local, o helper pode copiar a URL tokenizada automaticamente. Em SSH/headless, prefira o fluxo com `OPENCLAW_GATEWAY_TOKEN` acima.

## 9. Mantenha o acesso depois do Mac hibernar

O OpenClaw continua rodando no servidor mesmo que seu Mac hiberne, porque o Gateway foi instalado como servico `systemd --user` e o bootstrap habilita `linger` para o usuario `opc`.

Valide no servidor:

```bash
loginctl show-user opc -p Linger
systemctl --user is-enabled openclaw-gateway.service
systemctl --user is-active openclaw-gateway.service
```

O que nao sobrevive a hibernacao e o tunel SSH aberto no seu Mac. Quando o Mac dorme, a rede local para e a sessao TCP cai. Ao acordar, crie o tunel novamente:

```bash
ssh -N \
  -L 18789:127.0.0.1:18789 \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  <alias-ssh>
```

Para recriar o tunel automaticamente no macOS, crie um LaunchAgent local. Ajuste `oc_lab` para o alias SSH que voce configurou:

```bash
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$HOME/Library/LaunchAgents/com.openclaw.tunnel.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openclaw.tunnel</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/ssh</string>
    <string>-N</string>
    <string>-L</string>
    <string>18789:127.0.0.1:18789</string>
    <string>-o</string>
    <string>ExitOnForwardFailure=yes</string>
    <string>-o</string>
    <string>ServerAliveInterval=30</string>
    <string>-o</string>
    <string>ServerAliveCountMax=3</string>
    <string>oc_lab</string>
  </array>

  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/tmp/openclaw-tunnel.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/openclaw-tunnel.err</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.openclaw.tunnel.plist" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.openclaw.tunnel.plist"
launchctl kickstart -k "gui/$(id -u)/com.openclaw.tunnel"
```

Teste no Mac:

```bash
lsof -nP -iTCP:18789 -sTCP:LISTEN
curl -I http://127.0.0.1:18789/
```

Depois abra a UI local:

```text
http://127.0.0.1:18789/
```

Para ver logs ou parar o tunel automatico:

```bash
tail -f /tmp/openclaw-tunnel.err
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.openclaw.tunnel.plist"
```

Se voce precisa acessar a UI sem depender do Mac estar acordado, use uma camada permanente no servidor, como VPN/Tailscale ou Nginx HTTPS autenticado. Nao exponha a porta `18789` diretamente para a internet.

## O que pode ser variavel Terraform

Pode entrar como variavel antes do `apply`, porque nao e segredo:

- `oci_responses_region`;
- `oci_responses_project_ocid`;
- `openai_base_url`;
- `grok_model_id`;
- `gptoss_model_id`;
- `gateway_port`;
- `openclaw_npm_version`.

Nao e recomendado passar como variavel Terraform:

- `OCI_RESPONSES_API_KEY`;
- `OPENAI_API_KEY`;
- qualquer token de provedor LLM.

Mesmo usando variaveis `sensitive`, esses valores podem ficar no Terraform state, em metadados da instancia ou no historico do Resource Manager. O fluxo padrao deste modulo deixa os segredos fora do Terraform e exige a configuracao manual por SSH.

## Troubleshooting rapido

- `openclaw: command not found`: rode `source "$HOME/.bashrc"` ou abra uma nova sessao SSH.
- Gateway sem chave: confira `~/.openclaw/gateway.systemd.env` e reinicie com `openclaw gateway restart`.
- UI com `Auth required`: em SSH/headless, configure `OPENCLAW_GATEWAY_TOKEN` no `gateway.systemd.env`, aponte `gateway.auth.token` para essa env var e reinicie o gateway.
- UI com `Could not connect`: confirme se o tunel local existe com `lsof -nP -iTCP:18789 -sTCP:LISTEN` no Mac; se nao existir, abra o tunel SSH ou instale o LaunchAgent acima.
- `BadInstallScriptResult` no VS Code Remote SSH: teste `ssh <alias>` no terminal; se funcionar, crie um alias novo para a VM ou limpe o cache do Remote SSH.
- Web search sem resposta: confira `OCI_RESPONSES_API_KEY`, regiao e logs do gateway.
