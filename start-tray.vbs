' Text Editor - silent tray launcher (no console window flashes)
Option Explicit
Dim fso, sh, baseDir, q, ps
Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = baseDir
q = Chr(34)
' the 2nd argument 0 already means "hidden window", so do NOT also pass
' -WindowStyle Hidden to powershell: the combination makes it exit at once.
ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & q & baseDir & "\tray.ps1" & q
sh.Run ps, 0, False
