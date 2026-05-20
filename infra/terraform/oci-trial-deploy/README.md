# Terraform OCI Trial Deploy

Este Terraform cria uma infra nova para testar OpenClaw em OCI e executa o maximo possivel do bootstrap via cloud-init.

O deploy cria:

- VCN;
- Internet Gateway;
- Route Table;
- Security List;
- Subnet publica;
- Compute Instance Oracle Linux 9;
- Node.js 22;
- OpenClaw;
- plugin `oci-responses-grok-web`;
- agente `odin`;
- OpenClaw Gateway como servico `systemd --user` na porta `18789`.

Por seguranca, as chaves de LLM nao sao passadas como variaveis Terraform. Isso evita grava-las no Terraform state. Depois do `terraform apply`, conecte por SSH e preencha `~/.openclaw/gateway.systemd.env`.

## Pre-requisitos

- Terraform instalado.
- OCI provider autenticado via `~/.oci/config`, Resource Principal, Instance Principal ou variaveis de ambiente aceitas pelo provider.
- OCID do compartment.
- Chave SSH publica local.
- Quota de trial suficiente para a shape escolhida.

## Uso rapido

```bash
cd infra/terraform/oci-trial-deploy
cp terraform.tfvars.example terraform.tfvars
vi terraform.tfvars

terraform init
terraform fmt
terraform validate
terraform plan
terraform apply
```

Depois do apply:

```bash
terraform output ssh_command
ssh opc@$(terraform output -raw public_ip)
```

No servidor, acompanhe o bootstrap:

```bash
sudo tail -f /var/log/cloud-init-output.log
```

Configure as credenciais:

```bash
nano "$HOME/.openclaw/gateway.systemd.env"
chmod 600 "$HOME/.openclaw/gateway.systemd.env"
openclaw gateway restart
```

Conteudo esperado do arquivo:

```bash
OCI_RESPONSES_API_KEY=<sua-chave-oci-responses>
OCI_RESPONSES_REGION=us-chicago-1

# Opcional para fallback GPT-OSS ou endpoints OpenAI-compatible:
# OPENAI_API_KEY=<sua-chave>
# OPENAI_BASE_URL=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1
# OCI_RESPONSES_PROJECT_OCID=<ocid-do-projeto>
```

Valide:

```bash
openclaw --version
openclaw config validate
openclaw gateway status
openclaw models list --status-plain
openclaw agents list --json
openclaw agent --agent odin --message "Use web_search para responder com uma fonte atual." --json
```

## Arquivos

| Arquivo | Funcao |
| --- | --- |
| `versions.tf` | Versao do Terraform e provider OCI |
| `variables.tf` | Variaveis do deploy |
| `main.tf` | Recursos OCI e `user_data` da VM |
| `outputs.tf` | IP, comando SSH e proximos passos |
| `cloud-init.yaml.tftpl` | Bootstrap do servidor |
| `terraform.tfvars.example` | Exemplo de variaveis sem segredos |

## Destruicao

```bash
terraform destroy
```

## Observacoes

- A porta do OpenClaw Gateway fica em loopback (`127.0.0.1:18789`) e nao e aberta na Security List.
- A Security List abre SSH, HTTP e HTTPS. Restrinja `ssh_allowed_cidr` ao seu IP sempre que possivel.
- As credenciais de LLM devem ser inseridas depois do provisionamento, por SSH.
- Se a shape de trial nao estiver disponivel na regiao, ajuste `instance_shape`, `instance_ocpus` e `instance_memory_in_gbs`.

## Referencias

- Terraform OCI Provider: https://registry.terraform.io/providers/oracle/oci/latest/docs
- OCI Terraform: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/terraform.htm
