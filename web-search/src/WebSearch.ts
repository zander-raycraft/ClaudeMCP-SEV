#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * @description: Optimized WebSearch class for low-latency internet connectivity and web scraping
 * 
 * @param {Server} server - The server to handle web operations
 * @param {Map<string, {content: string, timestamp: number}>} cache - In-memory cache for scraped content
 * @param {number} cacheSizeLimit - Maximum number of cached entries
 * @param {number} cacheTTL - Cache time-to-live in seconds
 * 
 */
class WebSearch 
{
    private server: Server;
    private cache: Map<string, {content: string, timestamp: number}>;
    private cacheSizeLimit: number = 50;
    private cacheTTL: number = 3600; // 1 hour
    private lastConnectivityCheck: {isConnected: boolean, timestamp: number} | null = null;
    private connectivityTTL: number = 60; // 1 minute

    // default ctor
    constructor()
    {
        this.server = new Server(
            {
                name: 'web-search',
                version: '1.0.1',
            },
            {
                capabilities:
                {
                    tools: {}
                },
            }
        );

        this.cache = new Map();
        this.setupHandler();
    }

    /**
     * @description: Check internet connection with caching
     * @returns {Promise<boolean>} True if connected
     */
    private async checkInternetConnection(): Promise<boolean>
    {
        const now = Date.now() / 1000;
        if (this.lastConnectivityCheck && (now - this.lastConnectivityCheck.timestamp) < this.connectivityTTL)
        {
            return this.lastConnectivityCheck.isConnected;
        }

        try 
        {
            const response = await axios.head('https://www.google.com', { timeout: 3000 });
            this.lastConnectivityCheck = { isConnected: response.status < 300, timestamp: now };
            return this.lastConnectivityCheck.isConnected;
        }
        catch 
        {
            this.lastConnectivityCheck = { isConnected: false, timestamp: now };
            return false;
        }
    }

    /**
     * @description: Scrape website content with caching
     * @param {string} url - The URL to scrape
     * @returns {Promise<string>} Scraped content or error
     */
    private async scrapeWebsite(url: string): Promise<string>
    {
        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
        const now = Date.now() / 1000;
        
        // Check cache
        const cached = this.cache.get(normalizedUrl);
        if (cached && (now - cached.timestamp) < this.cacheTTL)
        {
            return `Cached content from ${normalizedUrl}:\n${'='.repeat(30)}\n${cached.content}`;
        }

        try 
        {
            const response = await axios.get(normalizedUrl, { 
                timeout: 5000,
                headers: { 'User-Agent': 'WebSearch/1.0' }
            });
            
            const $ = cheerio.load(response.data);
            const content = $('p, h1, h2, h3')
                .map((_, el) => $(el).text().trim())
                .get()
                .filter(text => text.length > 0)
                .slice(0, 10) // Limit to 10 elements
                .join('\n');
            
            const result = content || 'No content found';
            
            // Manage cache size
            if (this.cache.size >= this.cacheSizeLimit)
            {
                const oldestKey = this.cache.keys().next().value;
                if (oldestKey) {
                    this.cache.delete(oldestKey);
                }
            }
            
            this.cache.set(normalizedUrl, { content: result, timestamp: now });
            return `Scraped content from ${normalizedUrl}:\n${'='.repeat(30)}\n${result}`;
        }
        catch (error) 
        {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return `Error scraping ${normalizedUrl}: ${errorMessage}`;
        }
    }

    /**
     * @description: Reset cached scraped data
     */
    private resetCache(): void
    {
        this.cache.clear();
        this.lastConnectivityCheck = null;
    }

    /**
     * @description: Setup handler for MCP tools
     */
    private setupHandler(): void
    {
        /**
         * TOOLS:
         * 
         * 1. check_internet: Check internet connectivity
         * 2. scrape_website: Scrape and cache website content
         * 3. reset_cache: Clear cached data
         * 
         */
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools:
            [
                {
                    name: 'check_internet',
                    description: 'Check if internet is available',
                    inputSchema: { type: 'object', properties: {} },
                },
                {
                    name: 'scrape_website',
                    description: 'Scrape content from a website and cache it',
                    inputSchema:
                    {
                        type: 'object',
                        properties: 
                        {
                            url: { type: 'string', description: 'Website URL' },
                        },
                        required: ['url'],
                    },
                },
                {
                    name: 'reset_cache',
                    description: 'Clear all cached website data',
                    inputSchema: { type: 'object', properties: {} },
                },
            ],
        }));

        /**
         * @description: Handler for tool execution
         */
        this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
        {
            const {name, arguments: args} = request.params;

            switch (name)
            {
                case 'check_internet':
                    return {
                        content: [{
                            type: 'text',
                            text: `Internet: ${(await this.checkInternetConnection()) ? 'Connected' : 'Offline'}`
                        }]
                    };

                case 'scrape_website':
                    return {
                        content: [{
                            type: 'text',
                            text: await this.scrapeWebsite((args as {url: string}).url)
                        }]
                    };

                case 'reset_cache':
                    this.resetCache();
                    return {
                        content: [{
                            type: 'text',
                            text: 'Cache cleared'
                        }]
                    };

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    /**
     * @description: Run the server
     */
    async run(): Promise<void> 
    {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Web search server running...');
    }
}

// Start the server
const webSearch = new WebSearch();
webSearch.run().catch(console.error);