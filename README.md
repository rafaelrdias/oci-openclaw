# OpenClaw – Instalação no OCI

Este documento descreve o passo a passo para instalar e configurar o **OpenClaw** em uma instância da Oracle Cloud Infrastructure (OCI).

---

## Índice

- [Pré‑requisitos](#prérequisitos)
- [Criação da VM OCI](#criação-da-vm-oci)
- [Instalação de dependências](#instalação-de-dependências)
- [Instalação do OpenClaw](#instalação-do-openclaw)
- [Configuração básica](#configuração-básica)
- [Execução e verificação](#execução-e-verificação)
- [Estrutura de diretórios](#estrutura-de-diretórios)
- [Manutenção e atualização](#manutenção-e-atualização)

---

## Pré‑requisitos

| Item | Versão mínima | Como obter |
|------|---------------|-----------|
| **Oracle Cloud Account** | — | Crie em https://cloud.oracle.com |
| **VM OCI (Linux)** | Oracle Linux 9 (ou compatible) | Selecione *Oracle Linux 9* na criação da instância |
| **Acesso SSH** | — | Use a chave pública configurada na OCI |
| **Node.js** | v22.22.2 | `nvm install 22 && nvm use 22` |
| **npm** | v10.x | `npm install -g npm@latest` |
| **Git** | — | `sudo yum install -y git` |
| **curl** | — | já incluído na maioria das imagens Oracle Linux |

> **Obs.:** O OpenClaw não requer API keys externas para as funcionalidades básicas (Google Calendar/Gmail usam o wrapper `gws`).

---

## Criação da VM OCI

1. **Console OCI → Compute → Instances**
2. Clique em **Create Instance**
3. Defina:
   - Nome da instância (ex.: `openclaw‑agent`)
   - Compartment adequado
   - Shape: `VM.Standard.E2.1` (ou similar)
   - Image: *Oracle Linux 9*
4. Em **Add SSH Keys**, cole a sua chave pública ou gere‑a via `ssh-keygen`.
5. Opcional: habilite **Block Volume** caso deseje armazenamento extra.
6. Clique em **Create** e aguarde o provisionamento.

---

## Instalação de dependências

Conecte‑se à VM via SSH:

```bash
ssh -i ~/.ssh/id_rsa opc@<public_ip>
```

Dentro da VM, execute:

```bash
# Atualizar pacotes
sudo yum update -y

# Instalar Git e curl (se ainda não existirem)
sudo yum install -y git curl

# Instalar NVM (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Instalar Node.js 22.x
nvm install 22
nvm use 22

# Atualizar npm
npm install -g npm@latest
```

---

## Instalação do OpenClaw

```bash
# Instalar o CLI globalmente
npm i -g openclaw

# Verificar a instalação
openclaw --version
```

Em seguida, inicialize o diretório de trabalho padrão:

```bash
openclaw init --dir $HOME/.openclaw
```

Isso cria a estrutura `~/.openclaw/` com subpastas `workspace`, `docs`, `skills`, etc.

---

## Configuração básica

1. **Configurar o wrapper do Google Workspace (`gws`)**
   - Crie o diretório de configuração:
     ```bash
     mkdir -p $HOME/.config/gws
     ```
   - Coloque o arquivo de credenciais (`credentials.json`) fornecido pelo Google na pasta acima.
   - Verifique o caminho para o wrapper (já incluído no OpenClaw):
     ```bash
     which gws   # deve apontar para /home/opc/bin/gws
     ```
2. **Ajustar a configuração do gateway**
   ```bash
   openclaw gateway config edit
   ```
   - Defina `gateway.timezone = "America/Sao_Paulo"`
   - Defina `gateway.calendar.default = "primary"`
   - Salve e saia.
3. **Reiniciar o gateway** (necessário após alterações):
   ```bash
   openclaw gateway restart
   ```

---

## Execução e verificação

```bash
# Iniciar o agente principal (Odin)
openclaw start
```

Abra um segundo terminal e confira o status:

```bash
openclaw status
```

Você deve ver algo como:

```
Agent: Odin – running
Gateway: online
```

Teste um comando simples (ex.: obter agenda de hoje):

```bash
/home/opc/bin/gws calendar events list --params '{"calendarId":"primary","timeMin":"$(date +%Y-%m-%d)T00:00:00-03:00","timeMax":"$(date +%Y-%m-%d)T23:59:59-03:00","singleEvents":true,"orderBy":"startTime"}'
```

Se receber a lista de eventos, a integração está funcionando.

---

## Estrutura de diretórios (padrão OpenClaw)

```
$HOME/.openclaw/
│
├─ workspace/          # Código do seu agente, arquivos de memória, etc.
│   ├─ AGENTS.md
│   ├─ MEMORY.md
│   ├─ SOUL.md
│   └─ README.md      # <-- este arquivo
│
├─ docs/               # Documentação oficial (copiada na instalação)
│   └─ gateway/
│       ├─ configuration.md
│       └─ configuration-reference.md
│
└─ skills/             # Skills personalizadas
    └─ weather/
        └─ SKILL.md
```

---

## Manutenção e atualização

- **Atualizar o OpenClaw**
  ```bash
  npm i -g openclaw@latest
  openclaw gateway restart
  ```
- **Atualizar dependências do projeto**
  ```bash
  cd $HOME/.openclaw/workspace
  npm ci   # ou npm install
  ```
- **Verificar logs**
  ```bash
  tail -f $HOME/.openclaw/logs/agent.log
  ```

---

## Referências

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [OCI – Guia de Compute Instances](https://docs.oracle.com/en-us/iaas/Content/Compute/Concepts/computeoverview.htm)
- [Node.js – Instalação via NVM](https://github.com/nvm-sh/nvm)

---

*Este README foi gerado para facilitar a replicação da instalação do OpenClaw em qualquer instância OCI.*

