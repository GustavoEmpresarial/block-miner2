/**
 * Carrega só `.env` na RAIZ do projeto (não depende do cwd).
 *
 * Por quê não `import "dotenv/config"`?
 * — Ele lê `.env` em `process.cwd()`; rodando de outra pasta, o arquivo some.
 *
 * Docker: o `docker-compose` deve usar `env_file: .env` na máquina (arquivo na
 * mesma pasta do compose). O `.env` não entra na imagem (.dockerignore) — normal.
 */
import dotenv from "dotenv";
import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const envPath = path.join(ROOT, ".env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
