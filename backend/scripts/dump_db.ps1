# Dump local KoshalHaat Postgres (Docker service `db`) to backend/scripts/koshalhaat.sql.
# Run from anywhere; requires docker compose db healthy. Does not print secrets.

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $root

$rel = "backend\scripts\koshalhaat.sql"
docker compose exec -T db pg_dump -U localsync -d localsync `
    --schema=public --no-owner --no-acl --clean --if-exists `
    --exclude-table=spatial_ref_sys `
    --exclude-table-data=app_smtp_config `
    -f /tmp/koshalhaat.sql
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

docker compose cp db:/tmp/koshalhaat.sql .\$rel
if ($LASTEXITCODE -ne 0) { throw "docker compose cp failed" }
docker compose exec -T db rm -f /tmp/koshalhaat.sql

$path = Join-Path $root $rel
$text = [IO.File]::ReadAllText($path)
# pg_dump in the container writes LF line endings.
$text = $text.Replace("`r`n", "`n")

$schemaBlock = @"
DROP SCHEMA IF EXISTS public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';
"@.Replace("`r`n", "`n")

if (-not $text.Contains($schemaBlock)) {
    throw "pg_dump SCHEMA block did not match; update this script before committing a new dump."
}
$text = $text.Replace($schemaBlock, "")

$ext = @"
SET row_security = off;

-- KoshalHaat / localsync public-schema snapshot (schema + data).
-- SMTP config rows omitted. Do not DROP SCHEMA public (PostGIS lives there).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
"@.Replace("`r`n", "`n")

$oldHead = "SET row_security = off;"
if (-not $text.Contains($oldHead)) {
    throw "Dump header did not contain SET row_security = off;"
}
if (-not $text.Contains("CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;")) {
    $text = $text.Replace($oldHead, $ext)
}

$utf8 = New-Object System.Text.UTF8Encoding $false
[IO.File]::WriteAllText($path, $text, $utf8)
Write-Host "Wrote $rel ($(([IO.FileInfo]$path).Length) bytes)"
