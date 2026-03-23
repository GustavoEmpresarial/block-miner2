#Requires -Version 5.1
<#
.SYNOPSIS
  Envia o projeto (tarball) para a VPS e executa docker compose up -d --build app + healthcheck.

.DESCRIPTION
  NUNCA commite senha. Use uma destas opções:
  - Variável de ambiente: $env:BLOCKMINER_VPS_PW = 'sua-senha'
  - Ficheiro local (uma linha, sem newline extra): .deploy-pw.txt na raiz do repo (está no .gitignore)
  - Parâmetro -PwFile com caminho para ficheiro no formato PuTTY (-pwfile)

  Requer PuTTY (pscp.exe e plink.exe), normalmente em "C:\Program Files\PuTTY\".

.EXAMPLE
  $env:BLOCKMINER_VPS_PW = '***'; .\scripts\deploy-vps-windows.ps1

.EXAMPLE
  .\scripts\deploy-vps-windows.ps1 -PwFile .\.deploy-pw.txt
#>
param(
    [string] $SshHost = '89.167.119.164',
    [string] $SshUser = 'root',
    [string] $RemotePath = '/root/block-miner',
    [string] $PwFile = '',
    [string] $PscpExe = 'C:\Program Files\PuTTY\pscp.exe',
    [string] $PlinkExe = 'C:\Program Files\PuTTY\plink.exe',
    [switch] $SkipTarball,
    [string] $TarballPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RepoRoot

function Resolve-PwFilePath {
    if ($PwFile) {
        if (-not (Test-Path -LiteralPath $PwFile)) {
            throw "PwFile não encontrado: $PwFile"
        }
        return (Resolve-Path -LiteralPath $PwFile).Path
    }
    $envPw = $env:BLOCKMINER_VPS_PW
    if ($envPw) {
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("bm_deploy_pw_{0}.txt" -f [Guid]::NewGuid().ToString('N'))
        [System.IO.File]::WriteAllText($tmp, $envPw, [System.Text.UTF8Encoding]::new($false))
        return @{ Path = $tmp; Temp = $true }
    }
    $defaultLocal = Join-Path $RepoRoot '.deploy-pw.txt'
    if (Test-Path -LiteralPath $defaultLocal) {
        return (Resolve-Path -LiteralPath $defaultLocal).Path
    }
    throw @"
Defina credenciais SSH sem as pôr no Git:
  `$env:BLOCKMINER_VPS_PW = '...'
ou crie um ficheiro de uma linha na raiz do repo: .deploy-pw.txt
ou passe -PwFile 'C:\caminho\para\ficheiro'
"@
}

if (-not (Test-Path -LiteralPath $PscpExe)) { throw "pscp não encontrado: $PscpExe (instale PuTTY)." }
if (-not (Test-Path -LiteralPath $PlinkExe)) { throw "plink não encontrado: $PlinkExe (instale PuTTY)." }

$pwResolved = Resolve-PwFilePath
$pwFilePath = if ($pwResolved -is [hashtable]) { $pwResolved.Path } else { $pwResolved }
$removePwTemp = ($pwResolved -is [hashtable]) -and $pwResolved.Temp

try {
    if (-not $SkipTarball) {
        if (-not $TarballPath) {
            $TarballPath = Join-Path $RepoRoot '..\bm-deploy.tar.gz'
        }
        $TarballPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TarballPath)
        Write-Host '==> Criando tarball (exclui node_modules, .git, data, .env, etc.)...'
        if (Test-Path -LiteralPath $TarballPath) { Remove-Item -LiteralPath $TarballPath -Force }
        $excludes = @(
            '--exclude=node_modules',
            '--exclude=client/node_modules',
            '--exclude=client/dist',
            '--exclude=.git',
            '--exclude=data',
            '--exclude=forensics_vault',
            '--exclude=backup-template',
            '--exclude=uploads',
            '--exclude=.env',
            '--exclude=.env.production',
            '--exclude=.env.test',
            '--exclude=heap.heapsnapshot'
        )
        & tar.exe -czf $TarballPath @excludes -C $RepoRoot .
        if (-not (Test-Path -LiteralPath $TarballPath)) { throw 'Falha ao criar tarball.' }
        Write-Host "    $($TarballPath) ($([math]::Round((Get-Item $TarballPath).Length / 1MB, 2)) MB)"
    }
    else {
        if (-not $TarballPath) { throw 'Com -SkipTarball deve indicar -TarballPath com o .tar.gz já criado.' }
        $TarballPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TarballPath)
        if (-not (Test-Path -LiteralPath $TarballPath)) { throw "Tarball não encontrado: $TarballPath" }
    }

    $remoteTar = '/tmp/bm-deploy.tar.gz'
    Write-Host '==> Upload (pscp)...'
    & $PscpExe -batch -pwfile $pwFilePath $TarballPath "${SshUser}@${SshHost}:$remoteTar"

    $remoteCmd = @"
set -e
cd $RemotePath
tar -xzf $remoteTar
docker compose up -d --build app
curl -sS -o /dev/null -w 'health_http:%{http_code}\n' http://127.0.0.1:3000/health || true
"@
    Write-Host '==> Extrair + docker compose up -d --build app...'
    & $PlinkExe -batch -ssh -pwfile $pwFilePath "${SshUser}@${SshHost}" $remoteCmd
    Write-Host '==> Feito.'
}
finally {
    if ($removePwTemp -and (Test-Path -LiteralPath $pwFilePath)) {
        Remove-Item -LiteralPath $pwFilePath -Force -ErrorAction SilentlyContinue
    }
}
