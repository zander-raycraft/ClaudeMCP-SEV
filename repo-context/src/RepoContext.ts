#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @description: This is the RepoContext class for reading and analyzing GitHub repositories
 * 
 * @param {string} repoPath - The path to the repository directory
 * @param {Server} server - The server to handle repository operations
 * @param {Set<string>} ignoredDirs - Directories to ignore during analysis
 * 
 */
class RepoContext 
{
    private server: Server;
    private repoPath: string;
    private ignoredDirs: Set<string>;
    private ignoredFiles: Set<string>;

    // default ctor
    constructor()
    {
        this.server = new Server(
            {
                name: 'repo-context',
                version: '1.0.0',
            },
            {
                capabilities:
                {
                    tools: {}
                },
            }
        );

        this.repoPath = '';
        this.ignoredDirs = new Set([
            'node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 
            '__pycache__', '.pytest_cache', 'venv', '.venv', 'env', '.env',
            'coverage', '.coverage', 'logs', 'temp', 'tmp', '.tmp'
        ]);
        this.ignoredFiles = new Set([
            '.DS_Store', 'Thumbs.db', '.gitignore', '.gitattributes',
            '*.log', '*.tmp', '*.swp', '*.swo', '*~'
        ]);
        this.setupHandler();
    }

    /**
     * @description: Check if a directory should be ignored
     * @param {string} dirName - The directory name to check
     * @returns {boolean} True if the directory should be ignored
     */
    private shouldIgnoreDir(dirName: string): boolean
    {
        return this.ignoredDirs.has(dirName) || dirName.startsWith('.');
    }

    /**
     * @description: Check if a file should be ignored
     * @param {string} fileName - The file name to check
     * @returns {boolean} True if the file should be ignored
     */
    private shouldIgnoreFile(fileName: string): boolean
    {
        if (this.ignoredFiles.has(fileName)) return true;
        
        // Check for patterns
        const patterns = ['.log', '.tmp', '.swp', '.swo'];
        return patterns.some(pattern => fileName.endsWith(pattern));
    }

    /**
     * @description: Get the file extension from a file path
     * @param {string} filePath - The file path
     * @returns {string} The file extension
     */
    private getFileExtension(filePath: string): string
    {
        return path.extname(filePath).toLowerCase();
    }

    /**
     * @description: Determine if a file is a text file based on extension
     * @param {string} filePath - The file path
     * @returns {boolean} True if the file is likely a text file
     */
    private isTextFile(filePath: string): boolean
    {
        const textExtensions = new Set([
            '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
            '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.json',
            '.md', '.txt', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
            '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.sql',
            '.r', '.rb', '.php', '.go', '.rs', '.swift', '.kt', '.scala',
            '.dockerfile', '.dockerignore', '.gitignore', '.env', '.editorconfig'
        ]);
        
        const ext = this.getFileExtension(filePath);
        return textExtensions.has(ext) || !ext; // Files without extension might be text
    }

    /**
     * @description: Get directory structure recursively
     * @param {string} dirPath - The directory path to analyze
     * @param {number} maxDepth - Maximum depth to recurse
     * @param {number} currentDepth - Current recursion depth
     * @returns {Promise<any>} The directory structure
     */
    private async getDirectoryStructure(dirPath: string, maxDepth: number = 3, currentDepth: number = 0): Promise<any>
    {
        if (currentDepth >= maxDepth) return null;
        
        try 
        {
            const items = await fs.readdir(dirPath);
            const structure: any = { files: [], directories: {} };
            
            for (const item of items) 
            {
                const itemPath = path.join(dirPath, item);
                const stats = await fs.stat(itemPath);
                
                if (stats.isDirectory()) 
                {
                    if (!this.shouldIgnoreDir(item)) 
                    {
                        structure.directories[item] = await this.getDirectoryStructure(
                            itemPath, 
                            maxDepth, 
                            currentDepth + 1
                        );
                    }
                }
                else 
                {
                    if (!this.shouldIgnoreFile(item)) 
                    {
                        structure.files.push({
                            name: item,
                            size: stats.size,
                            extension: this.getFileExtension(item),
                            isText: this.isTextFile(item)
                        });
                    }
                }
            }
            
            return structure;
        }
        catch (error) 
        {
            return null;
        }
    }

    /**
     * @description: Get a summary of a file's content
     * @param {string} filePath - The file path
     * @returns {Promise<string>} A summary of the file
     */
    private async getFileSummary(filePath: string): Promise<string>
    {
        try 
        {
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            const extension = this.getFileExtension(filePath);
            
            let summary = `File: ${path.basename(filePath)}\n`;
            summary += `Size: ${stats.size} bytes\n`;
            summary += `Lines: ${lines.length}\n`;
            summary += `Extension: ${extension}\n`;
            
            // Add first few lines as preview
            const preview = lines.slice(0, 10).join('\n');
            summary += `\nPreview (first 10 lines):\n${preview}`;
            
            if (lines.length > 10) 
            {
                summary += `\n... (${lines.length - 10} more lines)`;
            }
            
            return summary;
        }
        catch (error) 
        {
            return `Error reading file: ${error}`;
        }
    }

    /**
     * @description: This is the setupHandler for the MCP
     */
    private setupHandler(): void
    {
        /**
         * TOOLS:
         * 
         * 1. set_repo_path: Set the path to the repository
         * 2. read_file: Read a specific file from the repo
         * 3. get_repo_structure: Get the directory structure of the repo
         * 4. list_files: List files in the repo with optional filters
         * 5. get_file_summary: Get a summary of a specific file
         * 6. analyze_repo: Analyze the overall repository structure
         * 
         */
        this.server.setRequestHandler(ListToolsRequestSchema, async () =>
        ({
            tools:
            [
                {
                    name: 'set_repo_path',
                    description: 'Set the path to the repository directory',
                    inputSchema:
                    {
                        type: 'object',
                        properties:
                        {
                            repoPath: 
                            {
                                type: 'string',
                                description: 'The absolute or relative path to the repository directory',
                            },
                        },
                        required: ['repoPath'],
                    },
                },
                {
                    name: 'read_file',
                    description: 'Read the contents of a specific file from the repository',
                    inputSchema:
                    {
                        type: 'object',
                        properties: 
                        {
                            filePath:
                            {
                                type: 'string',
                                description: 'Relative path to the file within the repository',
                            },
                        },
                        required: ['filePath'],
                    },
                },
                {
                    name: 'get_repo_structure',
                    description: 'Get the directory structure of the repository',
                    inputSchema:
                    {
                        type: 'object',
                        properties:
                        {
                            maxDepth:
                            {
                                type: 'number',
                                description: 'Maximum depth to recurse (default: 3)',
                            },
                        },
                    },
                },
                {
                    name: 'list_files',
                    description: 'List files in the repository with optional filters',
                    inputSchema:
                    {
                        type: 'object',
                        properties:
                        {
                            extension:
                            {
                                type: 'string',
                                description: 'Filter by file extension (e.g., .js, .py)',
                            },
                            directory:
                            {
                                type: 'string',
                                description: 'Search within specific directory',
                            },
                            textOnly:
                            {
                                type: 'boolean',
                                description: 'Only return text files',
                            },
                        },
                    },
                },
                {
                    name: 'get_file_summary',
                    description: 'Get a summary of a specific file',
                    inputSchema:
                    {
                        type: 'object',
                        properties:
                        {
                            filePath:
                            {
                                type: 'string',
                                description: 'Relative path to the file within the repository',
                            },
                        },
                        required: ['filePath'],
                    },
                },
                {
                    name: 'analyze_repo',
                    description: 'Analyze the overall repository structure and technologies',
                    inputSchema:
                    {
                        type: 'object',
                        properties: {}
                    },
                },
            ],
        }));

        /**
         * @description: This is the handler for tool execution
         */
        this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
        {
            const {name, arguments: args} = request.params;

            if (name === 'set_repo_path')
            {
                const {repoPath} = args as {repoPath: string};
                
                try 
                {
                    const resolvedPath = path.resolve(repoPath);
                    const stats = await fs.stat(resolvedPath);
                    
                    if (!stats.isDirectory()) 
                    {
                        return {
                            content:
                            [
                                {
                                    type: 'text',
                                    text: `Error: ${repoPath} is not a directory`,
                                },
                            ],
                        };
                    }
                    
                    this.repoPath = resolvedPath;
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Repository path set to: ${this.repoPath}`,
                            },
                        ],
                    };
                }
                catch (error) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Error setting repository path: ${error}`,
                            },
                        ],
                    };
                }
            }

            if (name === 'read_file')
            {
                if (!this.repoPath) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: 'Error: No repository path set. Use set_repo_path first.',
                            },
                        ],
                    };
                }

                const {filePath} = args as {filePath: string};
                const fullPath = path.join(this.repoPath, filePath);
                
                try 
                {
                    const content = await fs.readFile(fullPath, 'utf8');
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `File: ${filePath}\n${'='.repeat(50)}\n${content}`,
                            },
                        ],
                    };
                }
                catch (error) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Error reading file ${filePath}: ${error}`,
                            },
                        ],
                    };
                }
            }

            if (name === 'get_repo_structure')
            {
                if (!this.repoPath) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: 'Error: No repository path set. Use set_repo_path first.',
                            },
                        ],
                    };
                }

                const {maxDepth = 3} = args as {maxDepth?: number};
                
                try 
                {
                    const structure = await this.getDirectoryStructure(this.repoPath, maxDepth);
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Repository Structure:\n${JSON.stringify(structure, null, 2)}`,
                            },
                        ],
                    };
                }
                catch (error) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Error getting repository structure: ${error}`,
                            },
                        ],
                    };
                }
            }

            if (name === 'list_files')
            {
                if (!this.repoPath) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: 'Error: No repository path set. Use set_repo_path first.',
                            },
                        ],
                    };
                }

                const {extension, directory, textOnly} = args as {
                    extension?: string;
                    directory?: string;
                    textOnly?: boolean;
                };
                
                try 
                {
                    const searchPath = directory ? path.join(this.repoPath, directory) : this.repoPath;
                    const files: string[] = [];
                    
                    const walkDir = async (dirPath: string, relativePath: string = '') => 
                    {
                        const items = await fs.readdir(dirPath);
                        
                        for (const item of items) 
                        {
                            const itemPath = path.join(dirPath, item);
                            const relativeItemPath = path.join(relativePath, item);
                            const stats = await fs.stat(itemPath);
                            
                            if (stats.isDirectory()) 
                            {
                                if (!this.shouldIgnoreDir(item)) 
                                {
                                    await walkDir(itemPath, relativeItemPath);
                                }
                            }
                            else 
                            {
                                if (!this.shouldIgnoreFile(item)) 
                                {
                                    let include = true;
                                    
                                    if (extension && !item.endsWith(extension)) include = false;
                                    if (textOnly && !this.isTextFile(item)) include = false;
                                    
                                    if (include) 
                                    {
                                        files.push(relativeItemPath);
                                    }
                                }
                            }
                        }
                    };
                    
                    await walkDir(searchPath);
                    
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Found ${files.length} files:\n${files.join('\n')}`,
                            },
                        ],
                    };
                }
                catch (error) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Error listing files: ${error}`,
                            },
                        ],
                    };
                }
            }

            if (name === 'get_file_summary')
            {
                if (!this.repoPath) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: 'Error: No repository path set. Use set_repo_path first.',
                            },
                        ],
                    };
                }

                const {filePath} = args as {filePath: string};
                const fullPath = path.join(this.repoPath, filePath);
                
                try 
                {
                    const summary = await this.getFileSummary(fullPath);
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: summary,
                            },
                        ],
                    };
                }
                catch (error) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Error getting file summary: ${error}`,
                            },
                        ],
                    };
                }
            }

            if (name === 'analyze_repo')
            {
                if (!this.repoPath) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: 'Error: No repository path set. Use set_repo_path first.',
                            },
                        ],
                    };
                }

                try 
                {
                    const structure = await this.getDirectoryStructure(this.repoPath, 2);
                    let analysis = `Repository Analysis for: ${this.repoPath}\n`;
                    analysis += `${'='.repeat(50)}\n\n`;
                    
                    // Count files by extension
                    const extensionCounts: {[key: string]: number} = {};
                    const walkForAnalysis = (obj: any) => 
                    {
                        if (obj.files) 
                        {
                            obj.files.forEach((file: any) => 
                            {
                                const ext = file.extension || 'no extension';
                                extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
                            });
                        }
                        if (obj.directories) 
                        {
                            Object.values(obj.directories).forEach(walkForAnalysis);
                        }
                    };
                    
                    walkForAnalysis(structure);
                    
                    analysis += `File Types:\n`;
                    Object.entries(extensionCounts)
                        .sort(([,a], [,b]) => b - a)
                        .forEach(([ext, count]) => 
                        {
                            analysis += `  ${ext}: ${count} files\n`;
                        });
                    
                    // Detect technologies
                    analysis += `\nDetected Technologies:\n`;
                    const technologies = [];
                    
                    if (extensionCounts['.js'] || extensionCounts['.jsx']) technologies.push('JavaScript');
                    if (extensionCounts['.ts'] || extensionCounts['.tsx']) technologies.push('TypeScript');
                    if (extensionCounts['.py']) technologies.push('Python');
                    if (extensionCounts['.java']) technologies.push('Java');
                    if (extensionCounts['.cpp'] || extensionCounts['.c']) technologies.push('C/C++');
                    if (extensionCounts['.go']) technologies.push('Go');
                    if (extensionCounts['.rs']) technologies.push('Rust');
                    if (extensionCounts['.php']) technologies.push('PHP');
                    if (extensionCounts['.rb']) technologies.push('Ruby');
                    
                    technologies.forEach(tech => analysis += `  - ${tech}\n`);
                    
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: analysis,
                            },
                        ],
                    };
                }
                catch (error) 
                {
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Error analyzing repository: ${error}`,
                            },
                        ],
                    };
                }
            }

            throw new Error(`Unknown tool: ${name}`);
        });
    }

    /**
     * @description: Run the server
     */
    async run(): Promise<void> 
    {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Repository context server running...');
    }
}

// Start the server
const repoContext = new RepoContext();
repoContext.run().catch(console.error);