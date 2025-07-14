

# 🚀Optimize Claude with Custom Model Control Plugins (MCPs)

Welcome to the **Custom MCPs** repository, for enhancing Claude with modular, developer-friendly Model Control Plugins (MCPs). These plugins are designed to be highly customizable, enabling you to tailor Claude’s functionality to your specific needs with ease.

## Getting Started

Follow these steps to integrate Custom MCPs with Claude and unlock their full potential.

### Prerequisites

- **Claude Developer Mode**: Ensure developer mode is enabled in Claude to utilize MCP functionality.
- **Node.js**: Install Node.js (version 16 or higher) to manage dependencies.
- **npm**: Included with Node.js for package management.

### Installation Steps

1. **Navigate to an MCP Directory**  
   Access the folder of the desired MCP:

   ```bash
   cd path/to/your/mcp-folder
   ```

   *Example*: `cd txt-logger`

2. **Install Dependencies**  
   Run the following command to install all required dependencies:

   ```bash
   npm install
   ```

3. **Build the MCP**  
   Compile the MCP to generate the `dist/index.js` file:

   ```bash
   npm run build
   ```

4. **Configure Claude**  
   Update your `claude_desktop_config.json` file by adding the following entry under `mcpServers`:

   ```json
   {
       "mcpServers": {
           "<mcp-tool-name>": {
               "command": "node",
               "args": ["path/to/dist/index.js"]
           }
       }
   }
   ```

   - `<mcp-tool-name>`: Specify a unique name for your MCP (e.g., `txt-logger`).  
   - `path/to/dist/index.js`: Provide the path to the `dist/index.js` file generated during the build process.

### Example Configuration

For the `txt-logger` MCP, your `claude_desktop_config.json` might look like this:

```json
{
    "mcpServers": {
        "txt-logger": {
            "command": "node",
            "args": ["./txt-logger/dist/index.js"]
        }
    }
}
```

## Reporting Issues and Suggesting Features

If you encounter any issues or have ideas for new features, please submit them through our issue tracker. We value your feedback and will address it promptly.

## About TOMO RESEARCH LLC

This repository is developed and maintained as fit by **Tomo Research**,. For inquiries or ideas, contact me at zander@tomolab.io

