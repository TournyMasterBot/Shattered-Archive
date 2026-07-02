# AI Test File

This file was created to verify that the MCP server's workspace tools can correctly
access and write files in the ShatteredArchive project (C:/Projects/ShatteredArchive
on the host, /workspace/shattered-archive inside the Docker container).

## What was tested

- Correct Linux-style path usage (/workspace/shattered-archive/...)
- NOT Windows-style paths (C:\Projects\ShatteredArchive\...) which bash silently
  mangles on Linux by stripping backslashes as escape characters
- Directory creation (mkdir -p)
- File creation with content

## Path convention reminder

When using workspace_shell or any workspace_* tool, always use the mounted
Linux path, not the Windows host path:

  RIGHT: /workspace/shattered-archive/src/MyFile.kt
  WRONG: C:\Projects\ShatteredArchive\src\MyFile.kt
