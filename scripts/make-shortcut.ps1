# Creates, or repairs, the Start menu shortcut this application is pinned from.
#
# Windows takes a pinned button's icon and name from the SHORTCUT, never from the running
# window, so an application started with `npm start` and pinned from the taskbar is pinned as
# electron.exe — with Electron's own logo on it. Measured 2026-08-25 on this machine: the
# pinned Electron.lnk targeted node_modules\electron\dist\electron.exe with IconLocation ",0",
# and the Start menu already held an msg-hub.lnk pointing at an icon file that had not existed
# since the repository was anglicised.
#
# Installing the packaged build instead is not an option everywhere: the installer is unsigned,
# and Smart App Control refuses files that carry no reputation verdict. Running from source is
# the supported path on such a machine, so the shortcut has to be made to match it.
#
# AppUserModelID matters as much as the icon. The application sets one at startup, and Windows
# merges a running window with a pinned shortcut only when the two identities agree. A shortcut
# without it leaves two buttons on the taskbar: the pinned one and a separate live one.
#
# Usage:  npm run shortcut
[CmdletBinding()]
param(
  [string]$Repo,
  [string]$AppId = 'pl.kencki.msghub'
)

$ErrorActionPreference = 'Stop'

# Resolved here and not as a parameter default: $PSScriptRoot is empty inside a param block
# under Windows PowerShell 5.1, which is the interpreter `npm run shortcut` reaches.
if (-not $Repo) { $Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path }

$shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\M-HUB.lnk'
$electron = Join-Path $Repo 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $Repo 'src\renderer\icons\app.ico'

foreach ($required in @($electron, $icon)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Missing: $required — run npm install, and npm run icon, first."
  }
}

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = $electron
$link.Arguments = '"' + $Repo + '"'
$link.WorkingDirectory = $Repo
$link.IconLocation = "$icon,0"
$link.Description = 'M-HUB'
$link.Save()

# Until 0.5.0 this script wrote msg-hub.lnk. Left in place it is a second Start menu entry for
# the same application under its old name, and the wrong one of the two is easy to pin.
$legacy = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\msg-hub.lnk'
if (Test-Path -LiteralPath $legacy) {
  Remove-Item -LiteralPath $legacy -Force
  Write-Output "removed:  $legacy"
}

# WScript.Shell has no idea AppUserModelID exists; it lives in the shell property store, and
# reaching that means COM. The read-back below is the point of writing this at all: a property
# store call that quietly dropped the write would look exactly like one that took.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
  int GetCount(out uint count);
  int GetAt(uint index, out PropertyKey key);
  int GetValue(ref PropertyKey key, out PropVariant value);
  int SetValue(ref PropertyKey key, ref PropVariant value);
  int Commit();
}

[StructLayout(LayoutKind.Sequential)]
public struct PropertyKey {
  public Guid formatId;
  public uint propertyId;
}

// Padded to the real PROPVARIANT size — 16 bytes on x86, 24 on x64. A shorter struct would
// have the callee reading past the end of what was handed to it.
[StructLayout(LayoutKind.Sequential)]
public struct PropVariant {
  public ushort valueType;
  public ushort reserved1;
  public ushort reserved2;
  public ushort reserved3;
  public IntPtr pointer;
  public IntPtr padding;
}

public static class ShortcutIdentity {
  const uint GPS_READWRITE = 0x00000002;
  const ushort VT_LPWSTR = 31;
  static readonly Guid PropertyStoreId = new Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99");
  // System.AppUserModel.ID
  static PropertyKey AppUserModelId = new PropertyKey {
    formatId = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), propertyId = 5
  };

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName(
    string path, IntPtr bindContext, uint flags, ref Guid interfaceId, out IPropertyStore store);

  [DllImport("ole32.dll")]
  static extern int PropVariantClear(ref PropVariant value);

  public static void Set(string shortcutPath, string appId) {
    Guid interfaceId = PropertyStoreId;
    IPropertyStore store;
    SHGetPropertyStoreFromParsingName(shortcutPath, IntPtr.Zero, GPS_READWRITE, ref interfaceId, out store);
    try {
      var value = new PropVariant { valueType = VT_LPWSTR, pointer = Marshal.StringToCoTaskMemUni(appId) };
      try {
        Marshal.ThrowExceptionForHR(store.SetValue(ref AppUserModelId, ref value));
        Marshal.ThrowExceptionForHR(store.Commit());
      } finally {
        PropVariantClear(ref value);
      }
    } finally {
      Marshal.ReleaseComObject(store);
    }
  }

  public static string Get(string shortcutPath) {
    Guid interfaceId = PropertyStoreId;
    IPropertyStore store;
    SHGetPropertyStoreFromParsingName(shortcutPath, IntPtr.Zero, GPS_READWRITE, ref interfaceId, out store);
    try {
      PropVariant value;
      Marshal.ThrowExceptionForHR(store.GetValue(ref AppUserModelId, out value));
      try {
        return value.valueType == VT_LPWSTR ? Marshal.PtrToStringUni(value.pointer) : null;
      } finally {
        PropVariantClear(ref value);
      }
    } finally {
      Marshal.ReleaseComObject(store);
    }
  }
}
'@

[ShortcutIdentity]::Set($shortcut, $AppId)

# Read everything back from disk. What was intended is not evidence; what the shell now holds is.
$saved = $shell.CreateShortcut($shortcut)
$savedAppId = [ShortcutIdentity]::Get($shortcut)

Write-Output "shortcut: $shortcut"
Write-Output "target:   $($saved.TargetPath) $($saved.Arguments)"
Write-Output "icon:     $($saved.IconLocation)"
Write-Output "appid:    $savedAppId"

if ($savedAppId -ne $AppId) {
  throw "AppUserModelID did not take: expected '$AppId', the shortcut holds '$savedAppId'."
}

Write-Output ''
Write-Output 'Pin it from the Start menu, and unpin any older "Electron" button next to it.'
