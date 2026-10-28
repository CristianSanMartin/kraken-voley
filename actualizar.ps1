# =====================================================================
#  Kraken Voley - Actualizador
#  Baja la ultima version del codigo desde GitHub y la publica en la web.
#  La primera vez tambien instala lo necesario.
#  Lo ejecuta "Kraken - Actualizar.bat" (siempre descarga esta version al dia).
# =====================================================================
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$REPO    = 'CristianSanMartin/kraken-voley'
$CARPETA = Join-Path $env:USERPROFILE 'KrakenWeb'

function Titulo($t) { Write-Host ""; Write-Host "  $t" -ForegroundColor Magenta }
function Paso($t)   { Write-Host "  > $t" -ForegroundColor Cyan }
function Ok($t)     { Write-Host "  OK  $t" -ForegroundColor Green }
function Error2($t) { Write-Host "  [!] $t" -ForegroundColor Red }

Titulo 'KRAKEN VOLEY - Actualizar la web'
New-Item -ItemType Directory -Force -Path $CARPETA | Out-Null
Set-Location $CARPETA

# --- 1. Node.js -------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Error2 'Falta Node.js. Se abrira la pagina para descargarlo.'
  Write-Host '      Instala la version LTS (siguiente, siguiente) y vuelve a abrir el actualizador.'
  Start-Process 'https://nodejs.org/es'
  exit 1
}

# --- 2. clasp (herramienta oficial de Google) -------------------------
if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
  Paso 'Instalando clasp (solo la primera vez)...'
  & npm install -g '@google/clasp@2.4.2'
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) { Error2 'No se pudo instalar clasp. Cierra esta ventana y vuelve a intentarlo.'; exit 1 }
}

# --- 3. Sesion de Google ----------------------------------------------
if (-not (Test-Path (Join-Path $env:USERPROFILE '.clasprc.json'))) {
  Paso 'Primera vez: activa la "API de Google Apps Script" (interruptor en ACTIVADO) en la pagina que se abre.'
  Start-Process 'https://script.google.com/home/usersettings'
  Read-Host '      Cuando este activado, presiona ENTER'
  Paso 'Inicia sesion con tu cuenta de Google (la duena de Kraken_BD)...'
  & clasp login
}

# --- 4. ID del script --------------------------------------------------
if (-not (Test-Path '.clasp.json')) {
  Write-Host ''
  Write-Host '      Necesito el ID del script (solo esta vez):'
  Write-Host '      Kraken_BD > Extensiones > Apps Script > engranaje "Configuracion del proyecto" > "ID de secuencia de comandos"'
  $id = (Read-Host '      Pega el ID aqui').Trim()
  if (-not $id) { Error2 'No ingresaste el ID.'; exit 1 }
  Set-Content -Path '.clasp.json' -Value ('{"scriptId":"' + $id + '","rootDir":"src"}') -Encoding ASCII
}

# --- 5. Bajar la ultima version ---------------------------------------
Paso 'Bajando la ultima version desde GitHub...'
$zip = Join-Path $env:TEMP 'kraken-voley.zip'
$tmp = Join-Path $env:TEMP 'kraken-voley-extraido'
try {
  Invoke-WebRequest -UseBasicParsing -Uri ("https://codeload.github.com/$REPO/zip/refs/heads/main?t=" + [DateTime]::Now.Ticks) -OutFile $zip
} catch { Error2 "No pude descargar el codigo: $($_.Exception.Message)"; exit 1 }
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$raiz = Get-ChildItem $tmp | Select-Object -First 1
if (-not (Test-Path (Join-Path $raiz.FullName 'src'))) { Error2 'El paquete descargado no trae la carpeta src.'; exit 1 }
if (Test-Path 'src') { Remove-Item 'src' -Recurse -Force }
Copy-Item (Join-Path $raiz.FullName 'src') -Destination 'src' -Recurse
$version = ''
$vf = Join-Path $raiz.FullName 'VERSION'
if (Test-Path $vf) { $version = (Get-Content $vf -Raw).Trim() }
Ok "Version $version descargada"

# --- 6. Publicar --------------------------------------------------------
Paso 'Subiendo el codigo a Google...'
& clasp push -f
if ($LASTEXITCODE -ne 0) { Error2 'Fallo la subida. Copia el mensaje de arriba y enviaselo a Claude.'; exit 1 }

Paso 'Actualizando la web...'
$fecha = Get-Date -Format 'yyyy-MM-dd HH:mm'
if (Test-Path 'deploy_id.txt') {
  $dep = (Get-Content 'deploy_id.txt' -Raw).Trim()
  & clasp deploy -i $dep -d "v$version $fecha"
  if ($LASTEXITCODE -ne 0) { Error2 'No se pudo actualizar la publicacion.'; exit 1 }
} else {
  $out = & clasp deploy -d "v$version $fecha" 2>&1 | Out-String
  Write-Host $out
  $m = [regex]::Match($out, 'AKfy[\w-]+')
  if (-not $m.Success) { Error2 'No encontre el ID de la publicacion en la respuesta.'; exit 1 }
  $dep = $m.Value
  Set-Content -Path 'deploy_id.txt' -Value $dep -NoNewline
}
$url = "https://script.google.com/macros/s/$dep/exec"
Set-Content -Path 'URL de la web.txt' -Value $url -NoNewline
Write-Host ''
Ok "La web quedo en la version $version"
Write-Host "      $url" -ForegroundColor Green
Write-Host "      (tambien guardada en $CARPETA\URL de la web.txt)"
Start-Process $url
