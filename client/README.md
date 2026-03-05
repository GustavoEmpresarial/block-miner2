# Block Miner - Guia de Execução (Docker)

Este projeto foi containerizado para garantir que os ambientes de banco de dados (PostgreSQL) e da aplicação (Servidor Express + Frontend React/Vite) rodem exatamente da mesma forma em qualquer computador.

## Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando na sua máquina.

## Como iniciar o projeto

### 1. Primeira Execução (ou após fazer mudanças no código)
Sempre que você baixar o projeto pela primeira vez ou fizer **alterações no código-fonte** (como edição de arquivos React, HTML, ou backend), você deve forçar o Docker a recompilar a imagem da aplicação.

Abra o terminal na pasta raiz do projeto (`Block Miner`) e execute:

```bash
docker-compose up -d --build
```

- `-d`: Roda os containers em segundo plano (detached mode), liberando o seu terminal.
- `--build`: Força a recriação do Frontend (Vite) e Backend antes de iniciar o servidor.

### 2. Execuções Diárias Normais
Se você apenas desligou o computador e quer ligar o servidor novamente no dia seguinte (sem ter alterado o código), basta rodar:

```bash
docker-compose up -d
```

### 3. Como parar o servidor
Para desligar o sistema da forma correta (salvando logs e parando os containers graciosamente), execute:

```bash
docker-compose down
```

## Acessando o Sistema

Uma vez que o comando `up` for executado com sucesso:
- **Painel Block Miner:** [http://localhost:3000](http://localhost:3000)
- **Banco de Dados:** Conecta via rede interna pela porta padrão do postgres.

## Dicas Úteis

- **Para ver os logs (erros ou console.log) do backend:**
  ```bash
  docker-compose logs -f backend
  ```

- **Para acessar o terminal dentro do container do backend (se precisar rodar algum script interno):**
  ```bash
  docker exec -it block_miner_backend sh
  ```

- **Para atualizar o schema do Prisma dentro do banco de dados (necessita estar com o container ativo):**
  ```bash
  docker exec -it block_miner_backend npx prisma db push
  ```
