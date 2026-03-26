import { test } from "node:test";
import assert from "node:assert/strict";
import { isAddress, getAddress } from "ethers";

// Testes de validação de endereço de carteira Polygon (lógica usada no walletController)

test("isAddress aceita endereço Polygon válido", () => {
  assert.equal(isAddress("0x742D35CC6634C0532925a3B844Bc9E7595F2bD18"), true);
});

test("isAddress rejeita endereço curto", () => {
  assert.equal(isAddress("0x123"), false);
});

test("isAddress rejeita string vazia", () => {
  assert.equal(isAddress(""), false);
});

test("isAddress rejeita texto aleatório", () => {
  assert.equal(isAddress("not-an-address"), false);
});

test("getAddress retorna checksum correto", () => {
  const addr = "0x742d35cc6634c0532925a3b844bc9e7595f2bd18";
  const checksummed = getAddress(addr);
  assert.equal(checksummed, "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18");
});

test("getAddress lança para endereço inválido", () => {
  assert.throws(() => getAddress("0x123"));
});
