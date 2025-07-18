# RepoContext MCP

A Model Context Protocol (MCP) server for reading and analyzing GitHub repositories to provide comprehensive code context to AI assistants.

## Features

- 🗂️ **Repository Analysis** - Analyze directory structure and file types
- 📁 **Smart File Reading** - Read any file with automatic text detection
- 🔍 **File Filtering** - Filter by extension, directory, or text-only files
- 📊 **Technology Detection** - Automatically detect programming languages and frameworks
- 🚫 **Intelligent Ignoring** - Skip common directories like `node_modules`, `.git`, etc.
- 📋 **File Summaries** - Get detailed file information with previews

## Installation

```bash
npm install repo-context-mcp
```

## Usage

### Setting up the MCP Server

```bash
# Build the project
npm run build

# Start the server
npm start
```

### Available Tools

1. **`set_repo_path`** - Set the path to your repository
2. **`read_file`** - Read any file from the repository
3. **`get_repo_structure`** - Get the complete directory structure
4. **`list_files`** - List files with optional filters
5. **`get_file_summary`** - Get detailed file information
6. **`analyze_repo`** - Analyze technologies and file types

### Example Usage

```typescript
// Set repository path
await mcp.callTool('set_repo_path', { repoPath: '/path/to/your/repo' });

// Read a specific file
await mcp.callTool('read_file', { filePath: 'src/main.py' });

// Get repository structure
await mcp.callTool('get_repo_structure', { maxDepth: 3 });

// List Python files only
await mcp.callTool('list_files', { extension: '.py', textOnly: true });

// Analyze the entire repository
await mcp.callTool('analyze_repo', {});
```

## Configuration

### Ignored Directories
The following directories are automatically ignored:
- `node_modules`, `.git`, `.vscode`, `.idea`
- `dist`, `build`, `__pycache__`, `.pytest_cache`
- `venv`, `.venv`, `env`, `.env`
- `coverage`, `.coverage`, `logs`, `temp`, `tmp`

### Supported File Types
Automatic text file detection for:
- **JavaScript/TypeScript**: `.js`, `.ts`, `.jsx`, `.tsx`
- **Python**: `.py`
- **Web**: `.html`, `.css`, `.scss`, `.json`
- **Config**: `.yml`, `.yaml`, `.toml`, `.ini`
- **Documentation**: `.md`, `.txt`
- **And many more...**

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Watch for changes
npm run dev

# Clean build files
npm run clean

# Rebuild from scratch
npm run rebuild
```

## Project Structure

```
repo-context-mcp/
├── src/
│   └── RepoContext.ts      # Main MCP server implementation
├── dist/                   # Compiled JavaScript output (Comes after building)
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
└── README.md             
```

## Requirements

- Node.js 18.0.0 or higher
- TypeScript 5.3.0 or higher

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Common Issues

**Error: "No repository path set"**
- Make sure to call `set_repo_path` before using other tools

**Error: "File not found"**
- Check that the file path is relative to the repository root
- Ensure the file exists and is readable

**Error: "Directory access denied"**
- Check file permissions on the repository directory
- Ensure the path is correct and accessible

## Support

For issues and feature requests, please open an issue on the GitHub repository.