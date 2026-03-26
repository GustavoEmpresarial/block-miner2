# Storage - Sistema de Logs Organizado

Esta pasta contém todos os arquivos de armazenamento permanente do sistema, incluindo logs categorizados por tipo e importância.

## 📁 Estrutura de Pastas

```
storage/
├── logs/
│   ├── general/       # Logs gerais da aplicação
│   │   ├── info.log   # Informações operacionais normais
│   │   └── debug.log  # Informações de depuração (desenvolvimento)
│   │
│   ├── critical/      # Logs críticos e importantes
│   │   ├── error.log  # Erros do sistema
│   │   └── warn.log   # Avisos importantes
│   │
│   ├── security/      # Logs de segurança
│   │   └── warn.log   # Tentativas de autenticação, atividades suspeitas
│   │
│   ├── transactions/  # Logs de transações financeiras
│   │   └── info.log   # Depósitos, saques, trocas, compras
│   │
│   └── audit/         # Logs de auditoria
│       └── info.log   # Ações administrativas, mudanças no sistema
```

## 🔧 Como Usar

### Logs Padrão (Métodos Básicos)

```javascript
const logger = require("./utils/logger");

// Logs gerais
logger.info("Servidor iniciado", { port: 3000 });
logger.debug("Conexão estabelecida", { userId: 123 });

// Logs críticos
logger.warn("Limite de requisições atingido", { ip: "192.168.1.1" });
logger.error("Falha ao conectar ao banco de dados", { error: error.message });
```

### Logs Especializados (Métodos Avançados)

#### 🔐 Logs de Segurança

Use `logger.security()` para eventos relacionados a autenticação, autorização e atividades suspeitas:

```javascript
// Tentativa de login
logger.security("Failed login attempt", {
  userEmail: "user@example.com",
  ip: "192.168.1.1",
  reason: "Invalid password"
});

// Acesso negado
logger.security("Unauthorized access attempt", {
  userId: 123,
  resource: "/admin/users",
  ip: "192.168.1.1"
});

// Atividade suspeita
logger.security("Suspicious activity detected", {
  type: "rate_limit_exceeded",
  ip: "192.168.1.1",
  attempts: 50
});
```

Arquivos gerados: `storage/logs/security/warn.log`

---

#### 💰 Logs de Transações

Use `logger.transaction()` para registrar operações financeiras:

```javascript
// Depósito
logger.transaction("deposit", "Crypto deposit confirmed", {
  userId: 123,
  amount: 0.5,
  currency: "ETH",
  txHash: "0x123...",
  status: "confirmed"
});

// Saque
logger.transaction("withdrawal", "Withdrawal processed", {
  userId: 123,
  amount: 100.50,
  currency: "USDT",
  address: "0xabc...",
  status: "completed"
});

// Troca (Swap)
logger.transaction("swap", "Currency swap executed", {
  userId: 123,
  fromCurrency: "BTC",
  toCurrency: "ETH",
  fromAmount: 0.01,
  toAmount: 0.15,
  rate: 15.0
});

// Compra na loja
logger.transaction("purchase", "Item purchased from shop", {
  userId: 123,
  itemId: "gpu_rtx_4090",
  quantity: 2,
  totalPrice: 500,
  currency: "BMC"
});
```

Arquivos gerados: `storage/logs/transactions/info.log`

---

#### 📋 Logs de Auditoria

Use `logger.audit()` para ações administrativas e mudanças sensíveis no sistema:

```javascript
// Ação administrativa
logger.audit("user_banned", "admin@blockminer.com", {
  targetUserId: 456,
  reason: "Terms violation",
  duration: "permanent"
});

// Mudança de configuração
logger.audit("config_updated", "system", {
  setting: "withdrawal_limit",
  oldValue: 1000,
  newValue: 2000
});

// Concessão de acesso
logger.audit("permission_granted", "admin@blockminer.com", {
  targetUserId: 789,
  permission: "moderator",
  grantedAt: new Date().toISOString()
});
```

Arquivos gerados: `storage/logs/audit/info.log`

---

#### ⚠️ Logs Críticos

Use `logger.critical()` para erros graves que requerem atenção imediata:

```javascript
// Erro grave no sistema
logger.critical("Database connection lost", {
  error: error.message,
  stack: error.stack,
  affectedServices: ["wallet", "mining", "transactions"]
});

// Falha crítica de segurança
logger.critical("Security breach detected", {
  type: "sql_injection_attempt",
  ip: "192.168.1.1",
  endpoint: "/api/wallet/balance",
  payload: "malicious SQL..."
});
```

Arquivos gerados: `storage/logs/critical/error.log`

---

## 🔄 Rotação de Logs

Os logs são automaticamente rotacionados quando atingem o tamanho máximo configurado:

- **Tamanho Máximo por Arquivo**: 5 MB (padrão, configurável via `LOG_MAX_BYTES`)
- **Arquivos Mantidos**: 5 versões rotacionadas (configurável via `LOG_MAX_FILES`)
- **Nomeação**: `info.log`, `info.log.1`, `info.log.2`, ..., `info.log.5`

### Exemplo de Rotação

```
storage/logs/general/
├── info.log        # Arquivo atual
├── info.log.1      # Rotação mais recente
├── info.log.2
├── info.log.3
├── info.log.4
└── info.log.5      # Rotação mais antiga (será deletada na próxima rotação)
```

---

## 🎯 Boas Práticas

### 1. Use o Método Correto para Cada Situação

- **`info()`**: Operações normais, estado do sistema
- **`debug()`**: Informações de desenvolvimento (não aparece em produção)
- **`warn()`**: Situações anormais mas não críticas
- **`error()`**: Erros que afetam funcionalidades
- **`security()`**: Eventos de segurança, autenticação, autorização
- **`transaction()`**: Operações financeiras
- **`audit()`**: Ações administrativas, mudanças sensíveis
- **`critical()`**: Falhas graves que requerem atenção imediata

### 2. Sempre Forneça Contexto Adequado

```javascript
// ❌ Ruim - Falta contexto
logger.error("Error occurred");

// ✅ Bom - Com contexto útil
logger.error("Failed to process withdrawal", {
  userId: 123,
  amount: 100,
  error: error.message,
  stack: error.stack
});
```

### 3. Use Dados Estruturados

```javascript
// ✅ Excelente - Dados estruturados para fácil parsing
logger.transaction("withdrawal", "Withdrawal initiated", {
  userId: 123,
  withdrawalId: "wd_123456",
  amount: 100.50,
  currency: "USDT",
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  fee: 2.50,
  netAmount: 98.00,
  status: "pending",
  initiatedAt: new Date().toISOString()
});
```

### 4. Não Logue Informações Sensíveis

```javascript
// ❌ Nunca faça isso
logger.info("User logged in", {
  email: "user@example.com",
  password: "secret123", // NUNCA!!!
  privateKey: "0x..." // NUNCA!!!
});

// ✅ Faça isso
logger.security("User logged in", {
  userId: 123,
  email: "user@example.com",
  ip: "192.168.1.1",
  userAgent: "Mozilla/5.0..."
});
```

---

## 🔍 Monitoramento e Análise

### Encontrar Erros Críticos

```bash
# Windows PowerShell
Get-Content storage\logs\critical\error.log | Select-String "CRITICAL"

# Linux/Mac
grep "CRITICAL" storage/logs/critical/error.log
```

### Monitorar Transações

```bash
# Saques nas últimas 24h
Get-Content storage\logs\transactions\info.log | Select-String "withdrawal"

# Compras de um usuário específico
Get-Content storage\logs\transactions\info.log | Select-String "userId.:123"
```

### Verificar Tentativas de Login Falhadas

```bash
Get-Content storage\logs\security\warn.log | Select-String "Failed login"
```

---

## 📊 Variáveis de Ambiente

Configure o comportamento dos logs através de variáveis de ambiente:

```bash
# Tamanho máximo do arquivo de log (bytes)
LOG_MAX_BYTES=5242880  # 5 MB (padrão)

# Número máximo de arquivos rotacionados a manter
LOG_MAX_FILES=5  # (padrão)

# Nível mínimo de log (DEBUG, INFO, WARN, ERROR)
LOG_LEVEL=INFO  # (padrão)

# Ambiente de execução
NODE_ENV=production  # development ou production
```

---

## 🔒 Segurança e Manutenção

### Backup de Logs

Considere criar backups regulares dos logs importantes, especialmente:

- `storage/logs/transactions/` - Histórico financeiro
- `storage/logs/audit/` - Registro de ações administrativas
- `storage/logs/security/` - Eventos de segurança

### Exclusão Automática

Os arquivos mais antigos são automaticamente deletados após a 5ª rotação (configurável). Para logs de longo prazo, configure um sistema de arquivamento externo.

### Permissões

Certifique-se de que a pasta `storage/` tem permissões adequadas:

```bash
# Linux/Mac
chmod 750 storage/
chmod 640 storage/logs/**/*.log

# Permita apenas leitura/escrita para o processo da aplicação
```

---

## 📝 Formato de Log

Cada entrada de log segue o formato:

```
[<timestamp>] [<level>] [<module>] <message> | <structured_data>
```

### Exemplo

```
[2026-02-23T10:30:45.123Z] [INFO] [BlockMiner:Wallet] [TX:WITHDRAWAL] Withdrawal processed | {"userId":123,"amount":100.5,"currency":"USDT","status":"completed","transactionType":"withdrawal","timestamp":"2026-02-23T10:30:45.123Z","category":"TRANSACTION"}
```

---

## 🆘 Suporte

Para mais informações sobre o sistema de logging, consulte:

- `utils/logger.js` - Implementação completa
- Documentação do Node.js: https://nodejs.org/api/fs.html
- Best Practices: https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/

