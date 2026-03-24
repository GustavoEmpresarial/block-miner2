import {
  Loader2,
  ExternalLink,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  ScanSearch,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';

function TxLink({ base, hash, className = '' }) {
  if (!hash) return <span className="text-zinc-500">—</span>;
  const url = `${base || 'https://polygonscan.com/tx/'}${hash}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 text-sky-300 hover:text-white font-mono underline-offset-2 hover:underline ${className}`}
    >
      {hash.slice(0, 14)}…{hash.slice(-6)}
      <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
    </a>
  );
}

export default function WalletForensicsPanel({ loading, data, onRefresh }) {
  const base = data?.polygonscanBase || 'https://polygonscan.com/tx/';
  const days = data?.walletComparison?.chainDays ?? 365;

  if (loading) {
    return (
      <div className="rounded-2xl border border-cyan-500/40 bg-zinc-950 p-5 text-zinc-200">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
          <span className="font-semibold">A consultar Polygon / ledger…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 text-amber-100 text-sm">
        Não foi possível carregar a análise. Confirme <span className="font-mono text-amber-200">POLYGONSCAN_API_KEY</span> ou{' '}
        <span className="font-mono text-amber-200">ETHERSCAN_API_KEY</span> no .env do servidor e reinicie a app.
      </div>
    );
  }

  const onChain = data.onChainDepositsToGame || [];
  const ticketHashes = data.ticketHashesAnalysis || [];
  const fetchErrs = data.chainFetchErrors || [];

  return (
    <div className="rounded-2xl border-2 border-cyan-500/35 bg-zinc-950 p-5 space-y-5 text-zinc-100 shadow-lg shadow-cyan-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-cyan-300">
          <ScanSearch className="w-5 h-5" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest">Análise automática — blockchain</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Janela: últimos <span className="text-zinc-200 font-bold">{days}</span> dias · Carteiras:{' '}
              <span className="font-mono text-emerald-300/90">
                {(data.walletComparison?.scanWallets || []).join(', ') || '—'}
              </span>
            </p>
          </div>
        </div>
        {typeof onRefresh === 'function' ? (
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[10px] font-black uppercase tracking-wider text-zinc-200 border border-zinc-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar dados
          </button>
        ) : null}
      </div>

      {fetchErrs.length > 0 ? (
        <div className="rounded-xl bg-amber-950/50 border border-amber-600/40 p-3 text-[11px] text-amber-100 space-y-1">
          <p className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Avisos ao consultar explorer
          </p>
          {fetchErrs.map((e, i) => (
            <p key={i} className="font-mono text-amber-200/90 break-all">
              {e.wallet}: {e.error}
            </p>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl bg-zinc-900 border border-emerald-600/40 p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
          <ArrowDownCircle className="w-4 h-4" />
          Depósitos on-chain → carteira do jogo (um por transação)
        </p>
        <p className="text-[11px] text-zinc-400 leading-snug">
          Envios em POL da(s) carteira(s) acima para o endereço de depósito configurado no servidor. Cruzamento com depósitos
          registados na base de dados.
        </p>
        {data.chainError ? (
          <p className="text-amber-300 text-xs font-semibold">{data.chainError}</p>
        ) : onChain.length === 0 ? (
          <p className="text-zinc-500 text-sm py-2">Nenhuma transferência encontrada neste período para esse destino.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-700 max-h-[min(420px,50vh)] overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-zinc-950 z-10 border-b border-zinc-700">
                <tr className="text-zinc-400 uppercase tracking-tighter">
                  <th className="py-2.5 px-2 font-bold">Data (UTC)</th>
                  <th className="py-2.5 px-2 font-bold">POL</th>
                  <th className="py-2.5 px-2 font-bold">TxHash</th>
                  <th className="py-2.5 px-2 font-bold">De</th>
                  <th className="py-2.5 px-2 font-bold">No ledger?</th>
                </tr>
              </thead>
              <tbody>
                {onChain.map((row) => (
                  <tr key={row.hash} className="border-t border-zinc-800 hover:bg-zinc-800/50">
                    <td className="py-2.5 px-2 text-zinc-200 whitespace-nowrap font-mono">
                      {row.dateIso ? row.dateIso.replace('T', ' ').slice(0, 19) : '—'}
                    </td>
                    <td className="py-2.5 px-2 text-white font-bold tabular-nums">{Number(row.valuePol).toFixed(6)}</td>
                    <td className="py-2.5 px-2">
                      <TxLink base={base} hash={row.hash} />
                    </td>
                    <td className="py-2.5 px-2 font-mono text-zinc-300 text-[10px] break-all max-w-[140px]">
                      {row.from?.slice(0, 10)}…
                    </td>
                    <td className="py-2.5 px-2">
                      {row.inLedger ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sim ({row.ledgerStatus})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                          <XCircle className="w-3.5 h-3.5" /> Não creditado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ticketHashes.length > 0 ? (
        <div className="rounded-xl bg-zinc-900 border border-amber-600/35 p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Hashes enviados no chamado</p>
          <div className="overflow-x-auto rounded-lg border border-zinc-700">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-zinc-950 border-b border-zinc-700">
                <tr className="text-zinc-400 uppercase">
                  <th className="py-2 px-2 font-bold">TxHash</th>
                  <th className="py-2 px-2 font-bold">Estado no jogo</th>
                </tr>
              </thead>
              <tbody>
                {ticketHashes.map((row) => (
                  <tr key={row.hash} className="border-t border-zinc-800">
                    <td className="py-2 px-2">
                      <TxLink base={base} hash={row.hash} />
                    </td>
                    <td className="py-2 px-2">
                      {row.inLedger ? (
                        <span className="text-emerald-400 font-semibold">
                          Registado · {row.ledgerStatus} · {row.ledgerAmount != null ? `${row.ledgerAmount} POL` : ''}
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold">Sem registo de depósito com este hash</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl bg-zinc-900/80 border border-zinc-700 p-3 space-y-2">
        <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider">Endereço de depósito (env)</p>
        <p className="font-mono text-sm text-cyan-200 break-all">{data.gameDepositAddress || '—'}</p>
        {data.depositEnvReason ? <p className="text-xs text-amber-400">{data.depositEnvReason}</p> : null}
      </div>

      {data.linkedUser ? (
        <div className="rounded-xl bg-zinc-900/80 border border-zinc-700 p-4 space-y-2">
          <p className="text-[9px] font-black uppercase text-zinc-500 flex items-center gap-2 tracking-wider">
            <Wallet className="w-3.5 h-3.5" /> Conta vinculada
          </p>
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-zinc-200">
            <div>
              <span className="text-zinc-500">ID</span> <span className="font-bold text-white">{data.linkedUser.id}</span>
            </div>
            <div>
              <span className="text-zinc-500">@</span>{' '}
              <span className="font-bold text-white">{data.linkedUser.username || '—'}</span>
            </div>
            <div className="sm:col-span-2 break-all">
              <span className="text-zinc-500">E-mail</span> <span className="text-zinc-100">{data.linkedUser.email}</span>
            </div>
            <div className="sm:col-span-2 font-mono break-all text-emerald-200/90">
              <span className="text-zinc-500 font-sans">Carteira cadastrada</span> {data.linkedUser.walletAddress || '—'}
            </div>
            <div className="sm:col-span-2">
              <span className="text-zinc-500">Saldo POL (referência)</span>{' '}
              <span className="text-white font-bold tabular-nums">{Number(data.linkedUser.polBalance || 0).toFixed(6)}</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 pt-2 border-t border-zinc-800">
            Carteira do ticket = carteira da conta?{' '}
            <span className={data.walletComparison?.sameAsTicket ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {data.walletComparison?.sameAsTicket === null
                ? 'N/A'
                : data.walletComparison?.sameAsTicket
                  ? 'Sim'
                  : 'Não — verificar'}
            </span>
          </p>
        </div>
      ) : (
        <p className="text-amber-200 text-sm font-semibold bg-amber-950/40 border border-amber-700/40 rounded-xl p-3">
          Sem utilizador vinculado ao ticket — análise on-chain usa só carteiras extraídas do texto.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-3">
          <p className="text-[9px] font-black uppercase text-zinc-500 mb-2 flex items-center gap-1">
            <ArrowDownCircle className="w-3 h-3 text-emerald-500" /> Ledger — depósitos
          </p>
          <p className="text-xs text-zinc-300">
            {data.ledger?.depositSummary?.count ?? 0} reg. · concluídos:{' '}
            <span className="text-white font-bold">{(data.ledger?.depositSummary?.completedSum ?? 0).toFixed(4)} POL</span>
          </p>
          <p className="text-[10px] text-zinc-500 font-mono mt-1 break-all">
            {JSON.stringify(data.ledger?.depositSummary?.byStatus || {})}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-3">
          <p className="text-[9px] font-black uppercase text-zinc-500 mb-2 flex items-center gap-1">
            <ArrowUpCircle className="w-3 h-3 text-orange-400" /> Ledger — saques
          </p>
          <p className="text-xs text-zinc-300">
            {data.ledger?.withdrawalSummary?.count ?? 0} reg. · concluídos:{' '}
            <span className="text-white font-bold">{(data.ledger?.withdrawalSummary?.completedSum ?? 0).toFixed(4)} POL</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700 overflow-hidden">
        <p className="text-[9px] font-black uppercase text-zinc-500 px-3 py-2 bg-zinc-950 border-b border-zinc-800">
          Lista — depósitos internos (últimos 20)
        </p>
        <div className="max-h-44 overflow-y-auto bg-zinc-900/60">
          {(data.ledger?.deposits || []).slice(0, 20).map((row) => (
            <div
              key={row.id}
              className="px-3 py-2 border-t border-zinc-800 flex flex-wrap items-center gap-2 text-[11px] text-zinc-200"
            >
              <span className="text-emerald-400/90 font-bold uppercase w-20 shrink-0">{row.status}</span>
              <span className="text-white font-mono tabular-nums">{row.amount} POL</span>
              <TxLink base={base} hash={row.txHash} className="text-[10px]" />
            </div>
          ))}
          {!(data.ledger?.deposits || []).length ? (
            <p className="p-3 text-zinc-500 text-xs">Sem registos.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-700 overflow-hidden">
        <p className="text-[9px] font-black uppercase text-zinc-500 px-3 py-2 bg-zinc-950">Outras movimentações (amostra)</p>
        <div className="max-h-40 overflow-y-auto bg-zinc-900/50">
          {(data.chainSample || []).map((tx) => (
            <div key={tx.hash} className="px-3 py-2 border-t border-zinc-800 text-[10px] text-zinc-300">
              <TxLink base={base} hash={tx.hash} className="text-[10px]" /> · {Number(tx.valuePol).toFixed(4)} POL ·{' '}
              <span className="text-zinc-500">{tx.tag}</span>
            </div>
          ))}
          {!(data.chainSample || []).length ? (
            <p className="p-3 text-zinc-600 text-xs">Sem amostra.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-3">
        <p className="text-[9px] font-black uppercase text-zinc-500 mb-2">
          Fila manual opcional (orphan_deposits)
        </p>
        {data.orphanDepositsAuxTablePresent === false ? (
          <p className="text-xs text-zinc-400 leading-relaxed">
            Isto <span className="text-zinc-300 font-semibold">não</span> é a tabela de depósitos do jogo. Os depósitos creditados vêm do modelo{' '}
            <span className="font-mono text-zinc-200">transactions</span> (tipo <span className="font-mono">deposit</span>) — vê acima «Ledger —
            depósitos» e «Lista — depósitos internos». A tabela <span className="font-mono">orphan_deposits</span> é só uma fila SQL extra para
            alguns scripts de recuperação; nesta base não foi criada.
          </p>
        ) : data.orphansError ? (
          <p className="text-amber-200/90 text-xs leading-relaxed">{data.orphansError}</p>
        ) : (data.orphans || []).length ? (
          <ul className="text-xs font-mono text-zinc-200 space-y-1">
            {data.orphans.map((o, i) => (
              <li key={i}>
                {o.wallet_address} → {o.amount} POL
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500 text-xs">Nenhuma linha na fila orphan_deposits para estas carteiras.</p>
        )}
      </div>
    </div>
  );
}
