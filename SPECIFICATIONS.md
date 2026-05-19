# Especificações do Ambiente OpenClaw (OCI)

## 1. Visão geral do ambiente
- **Plataforma:** Oracle Cloud Infrastructure (OCI)
- **Sistema operacional:** Oracle Linux 9 (kernel 6.12.0‑109.67.6.el9uek.x86_64)
- **Instância:** VM padrão `VM.Standard.E2.1` (2 vCPU, 16 GB RAM)
- **Usuário de execução:** `opc`
- **Diretório raiz do OpenClaw:** `/home/opc/.openclaw`
- **Workspace de trabalho:** `/home/opc/.openclaw/workspace`

## 2. Componentes principais instalados
| Componente | Versão | Fonte / Instalação |
|------------|--------|-------------------|
| **Node.js** | v22.22.2 | Instalado via **nvm** (`nvm install 22`)
| **npm** | v10.x | Atualizado globalmente (`npm install -g npm@latest`)
| **OpenClaw CLI** | última (via npm) | `npm i -g openclaw`
| **Git** | 2.x | Pacote padrão da distribuição (`yum install git`)
| **curl** | 7.x | Distribuição padrão Oracle Linux
| **gws (Google Workspace wrapper)** | script custom | Instalado como parte do OpenClaw; caminho absoluto `/home/opc/bin/gws`
| **Skills custom** | – | `weather`, `skill-creator`, `taskflow`, `taskflow‑inbox‑triage`, `healthcheck`, `node‑connect`, `openai‑whisper‑api`

## 3. Wrappers e adaptações externas
### 3.1 `gws` – Wrapper para Google Calendar / Gmail
- **Objetivo:** Automatizar a renovação de token de acesso antes de chamar a API oficial do Google.
- **Localização:** `/home/opc/bin/gws`
- **Funcionamento:**
  1. Verifica a validade do token em `~/.config/gws/credentials.json`.
  2. Renova o token silenciosamente via OAuth refresh, se necessário.
  3. Executa a chamada real ao cliente Google Workspace com os parâmetros fornecidos.
- **Benefício:** Elimina falhas por expiração de credenciais nas rotinas de calendário e e‑mail.

### 3.2 `wttr.in` – Serviço leve de clima
- Utilizado pela skill **`weather`** para obter previsões rápidas sem necessidade de API‑key.
- Acesso via `curl "https://wttr.in/<cidade>?format=v2"`.

### 3.3 `openai‑whisper‑api` skill
- Envia áudio para o endpoint da OpenAI Audio Transcriptions (Whisper) usando o SDK interno.
- Não requer bibliotecas locais de áudio; a requisição é feita via `curl`.

## 4. Plugins / Skills customizados (fora do core)
| Skill | Propósito | Dependências externas |
|------|-----------|-----------------------|
| `weather` | Consulta clima via wttr.in | `curl`
| `skill-creator` | Cria/edita SKILL.md programaticamente | Nenhuma (apenas manipulação de arquivos)
| `taskflow` | Orquestração de tarefas assíncronas (jobs, estados, esperas) | Nenhuma
| `taskflow‑inbox‑triage` | Exemplo de fluxo para triagem de inbox | Integração com Gmail via `gws`
| `healthcheck` | Auditoria de hosts (SSH, firewall, atualizações) | Ferramentas de sistema (`sshd`, `ufw`, `yum`)
| `node‑connect` | Diagnóstico de pareamento de dispositivos Android/iOS/macOS | `adb`, `ios-deploy`
| `openai‑whisper‑api` | Transcrição de áudio | chave da OpenAI configurada em `OPENAI_API_KEY`

## 5. Configurações relevantes no `gateway`
```json
{
  "gateway": {
    "timezone": "America/Sao_Paulo",
    "calendar": {
      "default": "primary",
      "wrapper": "/home/opc/bin/gws"
    },
    "gmail": {
      "wrapper": "/home/opc/bin/gws"
    },
    "capabilities": {
      "whatsapp": {
        "inlineButtons": "allowlist"
      }
    }
  }
}
```

## 6. Estrutura de diretórios (visão resumida)
```
/home/opc/.openclaw/
│
├─ workspace/               # Código do agente Odin e arquivos de memória
│   ├─ AGENTS.md
│   ├─ MEMORY.md
│   ├─ SOUL.md
│   ├─ README.md            # Documentação de instalação
│   └─ SPECIFICATIONS.md   # <-- este documento
│
├─ docs/                    # Documentação oficial do OpenClaw
│   └─ gateway/
│       ├─ configuration.md
│       └─ configuration-reference.md
│
├─ skills/                  # Skills customizadas
│   ├─ weather/
│   │   └─ SKILL.md
│   ├─ skill-creator/
│   │   └─ SKILL.md
│   └─ …
│
├─ bin/                     # Binaries custom (ex.: gws wrapper)
│   └─ gws
│
└─ logs/                    # Logs de agente e gateway
    └─ agent.log
```

## 7. Como validar a instalação
```bash
# Verificar versão do OpenClaw
openclaw --version

# Checar status do agente
openclaw status

# Testar calendário (ex.: eventos de hoje)
/home/opc/bin/gws calendar events list \
  --params '{"calendarId":"primary","timeMin":"$(date +%Y-%m-%d)T00:00:00-03:00","timeMax":"$(date +%Y-%m-%d)T23:59:59-03:00","singleEvents":true,"orderBy":"startTime"}'
```
Se os comandos retornarem resultados sem erro, a instalação está completa.

---

*Este arquivo foi gerado automaticamente para documentação interna do ambiente OpenClaw em OCI.*

