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
- `BadInstallScriptResult` no VS Code Remote SSH: teste `ssh <alias>` no terminal; se funcionar, crie um alias novo para a VM ou limpe o cache do Remote SSH.
- Web search sem resposta: confira `OCI_RESPONSES_API_KEY`, regiao e logs do gateway.
