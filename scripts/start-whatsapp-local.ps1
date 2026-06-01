param(
  [switch]$SkipNextDev,
  [switch]$SkipWebhook,
  [switch]$ReuseNextDev,
  [int]$AppPort = 3000
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$EvolutionDir = Join-Path $Root "docker\evolution"
$AppUrl = "http://localhost:$AppPort"
$WebhookBaseUrl = "http://host.docker.internal:$AppPort/api/channels/whatsapp/evolution"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
  Write-Host "[OK] $message" -ForegroundColor Green
}

function Write-Warn($message) {
  Write-Host "[AVISO] $message" -ForegroundColor Yellow
}

function Write-Fail($message) {
  Write-Host "[ERRO] $message" -ForegroundColor Red
}

function Read-DotEnv($path) {
  $result = @{}

  if (-not (Test-Path -LiteralPath $path)) {
    return $result
  }

  Get-Content -LiteralPath $path | ForEach-Object {
    $line = $_.Trim()

    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }

    $parts = $line.Split("=", 2)
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")

    if ($key) {
      $result[$key] = $value
    }
  }

  return $result
}

function Set-DotEnvValue($path, $key, $value) {
  if (-not (Test-Path -LiteralPath $path)) {
    return
  }

  $lines = @(Get-Content -LiteralPath $path)
  $pattern = "^\s*#?\s*$([regex]::Escape($key))\s*="
  $found = $false
  $updatedLines = foreach ($line in $lines) {
    if ($line -match $pattern) {
      $found = $true
      "$key=$value"
    } else {
      $line
    }
  }

  if (-not $found) {
    $updatedLines += "$key=$value"
  }

  Set-Content -LiteralPath $path -Value $updatedLines -Encoding UTF8
}

function Test-CommandExists($command) {
  return [bool](Get-Command $command -ErrorAction SilentlyContinue)
}

function Test-DockerReady() {
  docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

function Start-DockerDesktopIfNeeded() {
  if (Test-DockerReady) {
    Write-Ok "Docker ja esta pronto."
    return
  }

  $dockerDesktopPaths = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LocalAppData\Docker\Docker Desktop.exe"
  )
  $dockerDesktop = $dockerDesktopPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if ($dockerDesktop) {
    Write-Warn "Docker ainda nao esta pronto. Vou abrir o Docker Desktop e aguardar."
    Start-Process -FilePath $dockerDesktop | Out-Null
  } else {
    Write-Warn "Docker ainda nao esta pronto. Abra o Docker Desktop manualmente se a espera falhar."
  }

  $deadline = (Get-Date).AddSeconds(150)

  while ((Get-Date) -lt $deadline) {
    if (Test-DockerReady) {
      Write-Ok "Docker ficou pronto."
      return
    }

    Start-Sleep -Seconds 5
  }

  Write-Fail "Docker nao ficou pronto a tempo. Abra o Docker Desktop, espere inicializar e execute este atalho de novo."
  exit 1
}

function Test-HttpOk($url, $timeoutSec = 4) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeoutSec
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Wait-Http($url, $label, $timeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk $url 4) {
      Write-Ok "$label respondeu em $url"
      return $true
    }

    Start-Sleep -Seconds 2
  }

  Write-Warn "$label nao respondeu em $url dentro de $timeoutSeconds segundos."
  return $false
}

function Get-PortProcess($port) {
  try {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) {
      return $null
    }

    return Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  } catch {
    return $null
  }
}

function Invoke-Evolution($method, $path, $headers, $body = $null) {
  $uri = "http://127.0.0.1:8080$path"
  $params = @{
    Method = $method
    Uri = $uri
    Headers = $headers
    TimeoutSec = 20
  }

  if ($null -ne $body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($body | ConvertTo-Json -Depth 10)
  }

  return Invoke-RestMethod @params
}

Set-Location $Root

Write-Host "FechouMEI - Inicializador local da Helena no WhatsApp" -ForegroundColor Magenta
Write-Host "Pasta: $Root"

Write-Step "Conferindo arquivos de ambiente"

$appEnvPath = Join-Path $Root ".env.local"
$evolutionEnvPath = Join-Path $EvolutionDir ".env"
$evolutionExamplePath = Join-Path $EvolutionDir ".env.exemple"

if (-not (Test-Path -LiteralPath $appEnvPath)) {
  Write-Fail "Nao encontrei .env.local na raiz do projeto."
  Write-Host "Crie o .env.local antes de iniciar a Helena localmente."
  exit 1
}

Set-DotEnvValue $appEnvPath "HELENA_V2_ENABLED" "true"
Set-DotEnvValue $appEnvPath "HELENA_V2_ALLOW_ALL" "true"
Set-DotEnvValue $appEnvPath "HELENA_FORCE_V1" "false"
Set-DotEnvValue $appEnvPath "HELENA_USE_V1_FALLBACK" "false"

$env:HELENA_V2_ENABLED = "true"
$env:HELENA_V2_ALLOW_ALL = "true"
$env:HELENA_FORCE_V1 = "false"
$env:HELENA_USE_V1_FALLBACK = "false"

Write-Ok "Helena local configurada para usar v2 por padrao."

if (-not (Test-Path -LiteralPath $evolutionEnvPath)) {
  if (Test-Path -LiteralPath $evolutionExamplePath) {
    Copy-Item -LiteralPath $evolutionExamplePath -Destination $evolutionEnvPath
    Write-Warn "Criei docker\evolution\.env a partir do exemplo. Revise os valores se a Evolution nao subir."
  } else {
    Write-Fail "Nao encontrei docker\evolution\.env nem arquivo de exemplo."
    exit 1
  }
}

$appEnv = Read-DotEnv $appEnvPath
$evolutionEnv = Read-DotEnv $evolutionEnvPath

$apiKey = $appEnv["EVOLUTION_API_KEY"]
if (-not $apiKey) {
  $apiKey = $evolutionEnv["EVOLUTION_API_KEY"]
}

$instance = $appEnv["EVOLUTION_API_INSTANCE"]
if (-not $instance) {
  $instance = "fechoumei-local"
}

$webhookSecret = $appEnv["WHATSAPP_WEBHOOK_SECRET"]

if (-not $apiKey) {
  Write-Fail "Nao encontrei EVOLUTION_API_KEY no .env.local nem em docker\evolution\.env."
  exit 1
}

if (-not $webhookSecret) {
  Write-Fail "Nao encontrei WHATSAPP_WEBHOOK_SECRET no .env.local. Sem isso o webhook local sera recusado."
  exit 1
}

if ($appEnv["WHATSAPP_CHANNEL_ENABLED"] -ne "true") {
  Write-Warn "WHATSAPP_CHANNEL_ENABLED nao esta como true no .env.local. O webhook pode ignorar mensagens."
}

Write-Ok "Ambiente encontrado. Instancia Evolution: $instance"

Write-Step "Subindo Evolution API no Docker"

if (-not (Test-CommandExists "docker")) {
  Write-Fail "Docker nao foi encontrado no PATH. Abra o Docker Desktop e tente de novo."
  exit 1
}

Start-DockerDesktopIfNeeded

Push-Location $EvolutionDir
try {
  docker compose up -d
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up -d falhou"
  }
} finally {
  Pop-Location
}

Wait-Http "http://127.0.0.1:8080" "Evolution API" 75 | Out-Null

Write-Step "Iniciando app Next.js local"

if ($SkipNextDev) {
  Write-Warn "SkipNextDev ativo. Nao vou iniciar npm.cmd run dev."
} else {
  $portProcess = Get-PortProcess $AppPort

  if ($portProcess) {
    if ($ReuseNextDev) {
      Write-Ok "Porta $AppPort ja esta em uso por $($portProcess.ProcessName) PID $($portProcess.Id). Vou reaproveitar."
    } else {
      Write-Warn "Porta $AppPort ja estava em uso por $($portProcess.ProcessName) PID $($portProcess.Id). Vou reiniciar para garantir a Helena v2 local."
      Stop-Process -Id $portProcess.Id -Force
      Start-Sleep -Seconds 2
      $portProcess = $null
    }
  }

  if (-not $portProcess) {
    $devCommand = "`$env:HELENA_V2_ENABLED='true'; `$env:HELENA_V2_ALLOW_ALL='true'; `$env:HELENA_FORCE_V1='false'; `$env:HELENA_USE_V1_FALLBACK='false'; npm.cmd run dev -- -p $AppPort -H 0.0.0.0"
    Start-Process powershell.exe -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $devCommand) -WorkingDirectory $Root
    Write-Ok "Abri uma janela nova com o app local em $AppUrl"
  }

  Wait-Http $AppUrl "App FechouMEI" 90 | Out-Null
}

if (-not $SkipWebhook) {
  Write-Step "Configurando webhook da Evolution para o app local"

  $headers = @{
    apikey = $apiKey
  }
  $WebhookUrl = "$WebhookBaseUrl`?webhook_secret=$([uri]::EscapeDataString($webhookSecret))"
  $WebhookDisplayUrl = "$WebhookBaseUrl`?webhook_secret=<redacted>"

  try {
    $state = Invoke-Evolution "Get" "/instance/connectionState/$instance" $headers
    Write-Ok "Instancia encontrada. Estado atual: $($state.instance.state)"
  } catch {
    Write-Warn "Instancia $instance ainda nao existe ou nao respondeu. Vou tentar criar."

    $createBody = @{
      instanceName = $instance
      integration = "WHATSAPP-BAILEYS"
      qrcode = $true
      token = $apiKey
      rejectCall = $true
      groupsIgnore = $true
      alwaysOnline = $false
      readMessages = $false
      readStatus = $false
      syncFullHistory = $false
    }

    try {
      Invoke-Evolution "Post" "/instance/create" $headers $createBody | Out-Null
      Write-Ok "Instancia $instance criada."
    } catch {
      Write-Warn "Nao consegui criar a instancia automaticamente: $($_.Exception.Message)"
    }
  }

  $webhookBody = @{
    webhook = @{
      enabled = $true
      url = $WebhookUrl
      events = @("MESSAGES_UPSERT")
      webhook_by_events = $false
      webhook_base64 = $false
    }
  }

  try {
    Invoke-Evolution "Post" "/webhook/set/$instance" $headers $webhookBody | Out-Null
    Write-Ok "Webhook configurado para $WebhookDisplayUrl"
  } catch {
    Write-Warn "Nao consegui configurar o webhook automaticamente: $($_.Exception.Message)"
  }

  Write-Step "Conferindo conexao do WhatsApp"

  try {
    $state = Invoke-Evolution "Get" "/instance/connectionState/$instance" $headers
    $connectionState = $state.instance.state

    if ($connectionState -eq "open") {
      Write-Ok "WhatsApp conectado na instancia $instance."
    } else {
      Write-Warn "WhatsApp ainda nao esta conectado. Estado atual: $connectionState"
      Write-Host "Vou pedir o QR/codigo de conexao para a Evolution. Se aparecer um QR no retorno, escaneie no WhatsApp."

      try {
        $connect = Invoke-Evolution "Get" "/instance/connect/$instance" $headers
        $connect | ConvertTo-Json -Depth 8
      } catch {
        Write-Warn "Nao consegui buscar o QR/codigo automaticamente: $($_.Exception.Message)"
      }
    }
  } catch {
    Write-Warn "Nao consegui conferir o estado da instancia: $($_.Exception.Message)"
  }
}

Write-Step "Resumo"
Write-Host "- Evolution API: http://127.0.0.1:8080"
Write-Host "- App local: $AppUrl"
Write-Host "- Webhook local esperado: $WebhookDisplayUrl"
Write-Host "- Helena: v2 local por padrao (v1 so com HELENA_FORCE_V1=true)"
Write-Host "- Para responder no WhatsApp, o numero precisa estar vinculado na tela Helena do app."
Write-Host ""
Write-Host "Pode deixar esta janela aberta enquanto testa. Para parar tudo, feche a janela do app e rode docker compose down em docker\evolution se quiser desligar a Evolution." -ForegroundColor Yellow
Write-Host ""
Read-Host "Pressione ENTER para fechar este inicializador"
