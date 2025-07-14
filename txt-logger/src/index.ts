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
 * @description: This is the ConversationLogger class for having the AI agent log conversations for reference
 * 
 * @param {string} logsDir - The directory to store log files
 * @param {Server} server - The server to log the conversation to
 * @param {string} currentProject - The current active project for logging
 * 
 */
class ConversationLogger 
{
    private server: Server;
    private logsDir: string;
    private currentProject: string;

    // default ctor
    constructor()
    {
        this.server = new Server(
            {
                name: 'txt-logger',
                version: '2.0.0',
            },
            {
                capabilities:
                {
                    tools: {}
                },
            }
        );

        this.logsDir = path.join(__dirname, '..', 'logs');
        this.currentProject = 'default';
        this.setupHandler();
    }

    /**
     * @description: Get the log file path for a specific project
     * @param {string} projectName - The name of the project (optional, uses current if not provided)
     * @returns {string} The full path to the project log file
     */
    private getLogFilePath(projectName?: string): string
    {
        const project = projectName || this.currentProject;
        const filename = `${project}_logs.txt`;
        return path.join(this.logsDir, filename);
    }

    /**
     * @description: Ensure the logs directory exists
     */
    private async ensureLogsDirectory(): Promise<void>
    {
        try 
        {
            await fs.mkdir(this.logsDir, { recursive: true });
        }
        catch (error)
        {
            console.error('Error creating logs directory:', error);
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
         * 1. log_message: Log a message to the current project log
         * 2. read_conversation: Read the conversation log from current or specified project
         * 3. set_project: Set the active project for logging
         * 4. list_projects: List all available project logs
         * 
         */
        this.server.setRequestHandler(ListToolsRequestSchema, async () =>
        ({
            tools:
            [
                {
                    name: 'log_message',
                    description: 'Log a message to the current project log',
                    inputSchema:
                    {
                        type: 'object',
                        properties:
                        {
                            speaker: 
                            {
                                type: 'string',
                                description: 'Who is speaking? (you or AI)',
                            },
                            message:
                            {
                                type: 'string',
                                description: 'info to be logged',
                            },
                        },
                        required: ['speaker', 'message'],
                    },
                },
                {
                    name: 'read_conversation',
                    description: 'Read the conversation log from current or specified project',
                    inputSchema:
                    {
                        type: 'object',
                        properties: 
                        {
                            projectName:
                            {
                                type: 'string',
                                description: 'Project name to read (optional, uses current if not specified)',
                            },
                        }
                    },
                },
                {
                    name: 'set_project',
                    description: 'Set the active project for logging',
                    inputSchema:
                    {
                        type: 'object',
                        properties:
                        {
                            projectName:
                            {
                                type: 'string',
                                description: 'Name of the project to switch to',
                            },
                        },
                        required: ['projectName'],
                    },
                },
                {
                    name: 'list_projects',
                    description: 'List all available project logs',
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

            if (name === 'log_message')
            {
                const {speaker, message} = args as {speaker: string; message: string};
                const timestamp = new Date().toISOString().split('T')[0];
                const entry = `[${timestamp}] ${speaker}: ${message}\n\n`;

                await this.ensureLogsDirectory();
                const logPath = this.getLogFilePath();
                await fs.appendFile(logPath, entry, 'utf8');
                
                return {
                    content:
                    [
                        {
                            type: 'text',
                            text: `Message logged successfully to ${this.currentProject}_logs.txt`,
                        },
                    ],
                };
            }

            if (name === 'read_conversation')
            {
                const {projectName} = args as {projectName?: string};
                const logPath = this.getLogFilePath(projectName);
                
                try 
                {
                    const content = await fs.readFile(logPath, 'utf8');
                    const project = projectName || this.currentProject;
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: content || `No conversation history yet for project: ${project}`,
                            },
                        ],
                    };
                } 
                catch (error) 
                {
                    const project = projectName || this.currentProject;
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `No conversation history yet for project: ${project}. Start chatting to create one!`,
                            },
                        ],
                    };
                }
            }

            if (name === 'set_project')
            {
                const {projectName} = args as {projectName: string};
                this.currentProject = projectName;
                
                // Ensure logs directory exists
                await this.ensureLogsDirectory();
                
                // Check if project file exists
                const logPath = this.getLogFilePath();
                let exists = false;
                try 
                {
                    await fs.access(logPath);
                    exists = true;
                }
                catch (error)
                {
                    // File doesn't exist, that's okay
                }
                
                return {
                    content:
                    [
                        {
                            type: 'text',
                            text: exists 
                                ? `Switched to existing project: ${projectName}` 
                                : `Created and switched to new project: ${projectName}`,
                        },
                    ],
                };
            }

            if (name === 'list_projects')
            {
                await this.ensureLogsDirectory();
                
                try
                {
                    const files = await fs.readdir(this.logsDir);
                    const logFiles = files.filter(f => f.endsWith('_logs.txt'));
                    
                    if (logFiles.length === 0)
                    {
                        return {
                            content:
                            [
                                {
                                    type: 'text',
                                    text: 'No project logs found yet.',
                                },
                            ],
                        };
                    }
                    
                    const projects = logFiles.map(f => f.replace('_logs.txt', ''));
                    const currentMarker = (p: string) => p === this.currentProject ? ' (current)' : '';
                    const projectList = projects.map(p => `- ${p}${currentMarker(p)}`).join('\n');
                    
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: `Available projects:\n${projectList}`,
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
                                text: 'Error listing projects.',
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
        console.error('Conversation logger running...');
    }
}

// Start the server
const logger = new ConversationLogger();
logger.run().catch(console.error);