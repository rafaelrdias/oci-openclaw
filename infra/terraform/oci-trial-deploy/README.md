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

Por seguranca, as chaves de LLM nao sao passadas como variaveis Terraform. Isso evita grava-las no Terraform state. Depois do apply, conecte por SSH e preencha `~/.openclaw/gateway.systemd.env`.

## Caminho recomendado: OCI Console Resource Manager

Sim: para um ambiente de trial ou uma criacao assistida pela Console OCI, o melhor caminho e criar um `.zip` deste modulo e executar pelo **Resource Manager**.

Vantagens:

- voce nao precisa instalar Terraform localmente para aplicar;
- a OCI gerencia `plan`, `apply`, historico e logs do job;
- o `.zip` fica self-contained, com Terraform, cloud-init e assets do agente/plugin;
- fica mais facil repetir o deploy em outro compartment.

## Pre-requisitos

- Terraform instalado.
- OCI provider autenticado via `~/.oci/config`, Resource Principal, Instance Principal ou variaveis de ambiente aceitas pelo provider.
- OCID do compartment.
- Chave SSH publica local.
- Quota de trial suficiente para a shape escolhida.

## Gerar o ZIP para a Console

Em uma maquina com o repositorio clonado:

```bash
cd infra/terraform/oci-trial-deploy
chmod +x build-resource-manager-zip.sh
./build-resource-manager-zip.sh
```

O script gera:

```text
infra/terraform/oci-trial-deploy/dist/oci-trial-resource-manager.zip
```

Esse ZIP contem os `.tf`, o `cloud-init.yaml.tftpl` e os assets necessarios para instalar o plugin `oci-responses-grok-web` e o agente `odin`.

## Executar pela OCI Console

1. Acesse a OCI Console.
2. Abra **Developer Services** > **Resource Manager** > **Stacks**.
3. Clique em **Create stack**.
4. Em **Stack configuration**, escolha **My configuration**.
5. Em **Terraform configuration source**, escolha **.Zip file**.
6. Faca upload de `dist/oci-trial-resource-manager.zip`.
7. Informe um nome, por exemplo `openclaw-trial`.
8. Confirme o compartment correto.
9. Avance ate **Configure variables** e preencha:
   - `region`;
   - `compartment_ocid`;
   - `prefix`;
   - `ssh_public_key_path` nao deve ser usado na Console se o arquivo local nao existir no ambiente do Resource Manager;
   - `ssh_public_key`;
   - `ssh_allowed_cidr`, preferencialmente seu IP publico com `/32`;
   - shape, OCPUs e memoria conforme sua quota de trial.
10. Clique em **Create**.
11. Abra a stack criada e clique em **Plan**.
12. Revise o plano.
13. Clique em **Apply**.
14. Ao final do job, abra **Outputs** e copie `public_ip` ou `ssh_command`.

Para uso pela Console, prefira preencher `ssh_public_key` diretamente na tela de variaveis. O campo `ssh_public_key_path` existe para execucao local com Terraform CLI.

Depois do apply:

```bash
ssh opc@<public_ip>
sudo tail -f /var/log/cloud-init-output.log
```

Quando o cloud-init terminar, configure as credenciais:

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

## Uso alternativo: Terraform CLI

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

## Arquivos

| Arquivo | Funcao |
| --- | --- |
| `versions.tf` | Versao do Terraform e provider OCI |
| `variables.tf` | Variaveis do deploy |
| `main.tf` | Recursos OCI e `user_data` da VM |
| `outputs.tf` | IP, comando SSH e proximos passos |
| `cloud-init.yaml.tftpl` | Bootstrap do servidor |
| `assets/` | Plugin, patch e arquivos do agente usados no cloud-init |
| `build-resource-manager-zip.sh` | Gera ZIP para upload no OCI Resource Manager |
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
