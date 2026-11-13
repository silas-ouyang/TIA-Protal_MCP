' Silently launch TIA Portal MCP server (no console window)
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName) & "\..\upstreams\a"
sh.CurrentDirectory = base
sh.Run """" & base & "\tia-portal-mcp.exe""", 0, False
