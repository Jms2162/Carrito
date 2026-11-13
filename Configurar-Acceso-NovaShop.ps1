$ErrorActionPreference = "Stop"

function ConvertTo-PlainText($secureString) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$password = Read-Host "Elegí una contraseña privada de al menos 16 caracteres (sin espacios)" -AsSecureString
$confirmation = Read-Host "Repetí la contraseña" -AsSecureString
$plainPassword = ConvertTo-PlainText $password
$plainConfirmation = ConvertTo-PlainText $confirmation

if ($plainPassword -notmatch '^[A-Za-z0-9!@#$%^&*()_+\-=.]{16,}$') {
  throw "La contraseña debe tener 16 caracteres o más y usar letras, números o estos símbolos: !@#$%^&*()_+-=."
}
if ($plainPassword -cne $plainConfirmation) {
  throw "Las contraseñas no coinciden. No se guardó ningún cambio."
}
if (-not $env:LOCALAPPDATA) {
  throw "Windows no informó una carpeta local para guardar la contraseña. No se guardó ningún cambio."
}

$configDirectory = Join-Path $env:LOCALAPPDATA "NovaShop"
[System.IO.Directory]::CreateDirectory($configDirectory) | Out-Null
$passwordPath = Join-Path $configDirectory "owner-password"
[System.IO.File]::WriteAllText(
  $passwordPath,
  $plainPassword,
  (New-Object System.Text.UTF8Encoding($false))
)
Write-Output "Contraseña privada configurada fuera de la carpeta del proyecto."
