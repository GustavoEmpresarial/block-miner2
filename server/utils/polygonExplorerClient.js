/**
 * Polygon mainnet reads via Etherscan API v2 (same key as POLYGONSCAN_API_KEY / ETHERSCAN_API_KEY).
 * Used when RPC is flaky; does not replace wallet-side RPC for signing/sending.
 */

const POLYGON_CHAIN_ID = 137;
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

function getPolygonExplorerApiKey() {
  return (
    process.env.POLYGONSCAN_API_KEY ||
    process.env.ETHERSCAN_API_KEY ||
    ""
  ).trim();
}

function parseProxyResult(result) {
  if (result == null) return null;
  if (typeof result === "string") {
    const t = result.trim();
    if (!t || t === "null") return null;
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return result;
}

async function explorerV2Proxy(action, extraParams = {}) {
  const apiKey = getPolygonExplorerApiKey();
  if (!apiKey) return null;

  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(POLYGON_CHAIN_ID));
  url.searchParams.set("module", "proxy");
  url.searchParams.set("action", action);
  url.searchParams.set("apikey", apiKey);
  for (const [k, v] of Object.entries(extraParams)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || String(data.status) !== "1") return null;
  return parseProxyResult(data.result);
}

/**
 * @returns {Promise<{ from: string, to: string, valueWei: bigint, chainId: number } | null>}
 */
export async function getPolygonTxFromExplorer(txHash) {
  const raw = await explorerV2Proxy("eth_getTransactionByHash", { txhash: txHash });
  if (!raw || typeof raw !== "object") return null;

  const from = typeof raw.from === "string" ? raw.from : null;
  const to = typeof raw.to === "string" ? raw.to : null;
  const valueHex = raw.value;
  if (!from || !to || valueHex == null) return null;

  let valueWei;
  try {
    valueWei = BigInt(String(valueHex));
  } catch {
    return null;
  }

  let chainId = POLYGON_CHAIN_ID;
  if (raw.chainId != null) {
    try {
      const cid = BigInt(String(raw.chainId));
      if (cid > 0n && cid < 1_000_000_000n) chainId = Number(cid);
    } catch {
      /* keep default */
    }
  }

  return { from, to, valueWei, chainId };
}

/**
 * @returns {Promise<{ statusOk: boolean, blockNumber: number } | null>}
 */
export async function getPolygonReceiptFromExplorer(txHash) {
  const raw = await explorerV2Proxy("eth_getTransactionReceipt", { txhash: txHash });
  if (!raw || typeof raw !== "object") return null;

  const statusHex = raw.status;
  const blockHex = raw.blockNumber;
  if (statusHex == null || blockHex == null) return null;

  let statusOk = false;
  try {
    statusOk = BigInt(String(statusHex)) === 1n;
  } catch {
    return null;
  }

  let blockNumber;
  try {
    blockNumber = Number(BigInt(String(blockHex)));
  } catch {
    return null;
  }

  return { statusOk, blockNumber };
}

export async function getPolygonBlockNumberFromExplorer() {
  const raw = await explorerV2Proxy("eth_blockNumber");
  if (raw == null) return null;
  try {
    return Number(BigInt(String(raw)));
  } catch {
    return null;
  }
}
