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
 * @param {string} logFile - The file to log the conversation to
 * @param {Server} server - The server to log the conversation to
 * 
 */
class ConversationLogger 
{
    private server: Server;
    private logFile: string;

    // default ctor
    constructor(logFile: string = 'conversation.txt')
    {
        this.server = new Server(
            {
                name: 'txt-logger',
                version: '1.0.0',
            },
            {
                capabilities:
                {
                    tools: {}
                },
            }
        );

        this.logFile = path.join(__dirname, '..', logFile);
        this.setupHandler();
    }

    /**
     * @description: This is the setupHandler for the MCP
     */
    private setupHandler(): void
    {
        /**
         * TOOLS:
         * 
         * 1. log_message: Log a message to the conversation log
         * 2. read_conversation: Read the conversation log
         * 
         */
        this.server.setRequestHandler(ListToolsRequestSchema, async () =>
        ({
            tools:
            [
                {
                    name: 'log_message',
                    description: 'Log a message to the conversation log',
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
                    description: 'Read the conversation log',
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

                await fs.appendFile(this.logFile, entry, 'utf8');
                
                return {
                    content:
                    [
                        {
                            type: 'text',
                            text: 'Message logged successfully',
                        },
                    ],
                };
            }

            if (name === 'read_conversation')
            {
                try 
                {
                    const content = await fs.readFile(this.logFile, 'utf8');
                    return {
                        content:
                        [
                            {
                                type: 'text',
                                text: content || 'No conversation history yet.',
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
                                text: 'No conversation history yet. Start chatting to create one!',
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