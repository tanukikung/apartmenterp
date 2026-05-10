param(
  [ValidateSet('init', 'up', 'down', 'restart', 'logs', 'status')]
  [string]$Action = 'up',
  [string]$BaseUrl = 'http://localhost:3000',
  [int]$AppPort = 3000
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $root 'docker-compose.customer.yml'
$templateFile = Join-Path $root '.env.customer.example'
$envFile = Join-Path $root '.env.customer'

function New-HexSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return ($buffer | ForEach-Object { $_.ToString('x2') }) -join ''
}

function Initialize-CustomerEnv {
  if (Test-Path $envFile) {
    Write-Host ".env.customer already exists at $envFile"
    return
  }

  if (-not (Test-Path $templateFile)) {
    throw "Missing template file: $templateFile"
  }

  $content = Get-Content -Path $templateFile -Raw
  $cookieSecure = if ($BaseUrl.StartsWith('https://')) { 'true' } else { 'false' }

  $content = $content.Replace('__APP_BASE_URL__', $BaseUrl)
  $content = $content.Replace('__APP_PORT__', [string]$AppPort)
  $content = $content.Replace('__POSTGRES_PASSWORD__', (New-HexSecret 18))
  $content = $content.Replace('__NEXTAUTH_SECRET__', (New-HexSecret 32))
  $content = $content.Replace('__CRON_SECRET__', (New-HexSecret 32))
  $content = $content.Replace('__INVOICE_ACCESS_SECRET__', (New-HexSecret 32))
  $content = $content.Replace('__FILE_ACCESS_SECRET__', (New-HexSecret 32))
  $content = $content.Replace('__SEED_OWNER_PASSWORD__', (New-HexSecret 12))
  $content = $content.Replace('__SEED_STAFF_PASSWORD__', (New-HexSecret 12))
  $content = $content.Replace('__COOKIE_SECURE__', $cookieSecure)

  Set-Content -Path $envFile -Value $content -Encoding UTF8

  $ownerPassword = Get-CustomerEnvValue 'SEED_OWNER_PASSWORD'
  $staffPassword = Get-CustomerEnvValue 'SEED_STAFF_PASSWORD'

  Write-Host "Created .env.customer with generated secrets."
  Write-Host "Initial admin credentials:"
  Write-Host "  owner / $ownerPassword"
  Write-Host "  staff / $staffPassword"
  Write-Host "Review $envFile before first deploy if you need a custom domain, LINE, or S3."
}

function Assert-DockerAvailable {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed. Please install Docker Desktop first."
  }

  $null = & docker compose version 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose is not available. Please install or enable the Docker Compose plugin."
  }

  $null = & docker info 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker daemon is not running. Start Docker Desktop and try again."
  }
}

function Get-CustomerEnvValue([string]$Key) {
  if (-not (Test-Path $envFile)) {
    return $null
  }

  $match = Get-Content -Path $envFile | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $match) {
    return $null
  }

  return $match.Substring($Key.Length + 1)
}

function Invoke-CustomerCompose([string[]]$ComposeArgs) {
  & docker compose -f $composeFile --env-file $envFile @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed."
  }
}

switch ($Action) {
  'init' {
    Initialize-CustomerEnv
  }
  'up' {
    Initialize-CustomerEnv
    Assert-DockerAvailable
    Invoke-CustomerCompose @('up', '-d', '--build')
    $appUrl = Get-CustomerEnvValue 'APP_BASE_URL'
    Write-Host ""
    Write-Host "Apartment ERP is starting."
    Write-Host "Open: $appUrl"
    Write-Host "Initial admin credentials are stored in $envFile"
  }
  'down' {
    if (-not (Test-Path $envFile)) {
      throw ".env.customer not found. Run init first."
    }
    Assert-DockerAvailable
    Invoke-CustomerCompose @('down')
  }
  'restart' {
    if (-not (Test-Path $envFile)) {
      throw ".env.customer not found. Run init first."
    }
    Assert-DockerAvailable
    Invoke-CustomerCompose @('up', '-d', '--build')
  }
  'logs' {
    if (-not (Test-Path $envFile)) {
      throw ".env.customer not found. Run init first."
    }
    Assert-DockerAvailable
    Invoke-CustomerCompose @('logs', '-f', 'app')
  }
  'status' {
    if (-not (Test-Path $envFile)) {
      throw ".env.customer not found. Run init first."
    }
    Assert-DockerAvailable
    Invoke-CustomerCompose @('ps')
  }
}
