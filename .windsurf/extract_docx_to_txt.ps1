Param(
  [Parameter(Mandatory=$true)][string]$DocxPath,
  [Parameter(Mandatory=$true)][string]$OutTxt
)

# Ensure paths are full
$DocxPath = [System.IO.Path]::GetFullPath($DocxPath)
$OutTxt   = [System.IO.Path]::GetFullPath($OutTxt)
$workDir  = Join-Path ([System.IO.Path]::GetDirectoryName($OutTxt)) ("_extracted_" + [guid]::NewGuid().ToString())

# Prepare temp directory
[System.IO.Directory]::CreateDirectory($workDir) | Out-Null

# Extract .docx (zip) contents
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($DocxPath, $workDir)

# Read main document XML
$xmlPath = Join-Path $workDir 'word\document.xml'
if (!(Test-Path $xmlPath)) { throw "document.xml not found in $workDir" }

# Load raw XML
$raw = Get-Content -LiteralPath $xmlPath -Raw

# Extract text nodes (w:t) and also replace w:tab and paragraph markers
# Simple extraction to preserve words in order
$raw = $raw -replace '<w:tab/>','\t'

# Gather all text within <w:t> ... </w:t>
$matches = [regex]::Matches($raw, '<w:t[^>]*>(.*?)</w:t>')
$texts = @()
foreach ($m in $matches) { $texts += $m.Groups[1].Value }

# Insert paragraph breaks where </w:p> occurs
$paraSplits = ($raw -split '</w:p>')
# Approximate: after each paragraph, add a newline
# But we also want the extracted texts in order; so fallback to simple join for now
$content = ($texts -join " ")

# Normalize whitespace
$content = $content -replace '\r?\n',' '
$content = $content -replace '\s+',' '

# Write out
Set-Content -Path $OutTxt -Value $content -Encoding UTF8

Write-Output "Extracted to: $OutTxt"
