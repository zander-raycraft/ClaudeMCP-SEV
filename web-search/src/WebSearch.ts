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
    private cache: Map<string, {content: string, timestamp: number, ttl: number}>;
    private cacheSizeLimit: number = 50;
    private cacheTTL: number = 3600; // 1 hour default
    private lastConnectivityCheck: {isConnected: boolean, timestamp: number} | null = null;
    private connectivityTTL: number = 60; // 1 minute

    /**
     * @description: Strategies for different websites
     * - basic: Sites that work well with simple scraping
     * - api: Sites with available APIs
     * - dynamic: Sites that require JavaScript rendering
     */
    private strategies = {
        basic: ['github.com', 'wikipedia.org', 'docs.python.org', 'stackoverflow.com'],
        api: {
            'github.com': 'https://api.github.com',
            'reddit.com': 'https://www.reddit.com',
            'news.ycombinator.com': 'https://hacker-news.firebaseio.com/v0'
        },
        dynamic: ['instagram.com', 'x.com', 'twitter.com', 'linkedin.com', 'facebook.com']
    };

    // default ctor
    constructor()
    {
        this.server = new Server(
            {
                name: 'web-search',
                version: '2.0.0',
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
     * @description: Get cache key for URL
     * @param {string} url - The URL to generate cache key for
     * @returns {string} Cache key
     */
    private getCacheKey(url: string): string 
    {
        try 
        {
            const urlObj = new URL(url);
            // Different cache strategies for different content types
            if (urlObj.pathname.includes('/api/')) 
            {
                return url;
            }
            return urlObj.hostname + urlObj.pathname; 
        }
        catch 
        {
            return url; 
        }
    }

    /**
     * @description: Get cache TTL based on content type
     * @param {string} url - The URL to determine TTL for
     * @returns {number} TTL in seconds
     */
    private getCacheTTL(url: string): number 
    {
        try 
        {
            const urlObj = new URL(url);
            
            // Different TTLs for different content
            if (urlObj.pathname.includes('/feed') || urlObj.pathname.includes('/timeline')) 
            {
                return 300; // 5 minutes for feeds
            }
            if (urlObj.hostname.includes('github.com')) 
            {
                return 1800; // 30 minutes for profiles
            }
            if (urlObj.hostname.includes('news') || urlObj.hostname.includes('reddit')) 
            {
                return 600; // 10 minutes for news
            }
        }
        catch 
        {
            // Ignore URL parsing errors
        }
        
        return 3600; // 1 hour default
    }

    /**
     * @description: Calculate confidence score for scraped content
     * @param {any} content - The extracted content object
     * @returns {number} Confidence score between 0 and 1
     */
    private calculateConfidence(content: any): number 
    {
        let score = 0;
        
        // Check for structured data
        if (content.jsonLd && content.jsonLd.length > 0) score += 0.3;
        if (content.metaData.title) score += 0.2;
        if (content.metaData.description) score += 0.1;
        
        // Check main content
        if (content.mainContent && content.mainContent.length > 0) 
        {
            const totalLength = content.mainContent.join('').length;
            if (totalLength > 500) score += 0.3;
            else if (totalLength > 200) score += 0.2;
            else if (totalLength > 50) score += 0.1;
        }
        
        // Platform-specific data
        if (content.githubData && content.githubData.username) score += 0.1;
        
        return Math.min(score, 1);
    }

    /**
     * @description: Format extracted content into readable string
     * @param {any} content - The content object to format
     * @returns {string} Formatted content string
     */
    private formatContent(content: any): string 
    {
        const parts: string[] = [];
        
        // Add metadata
        if (content.metaData.title) 
        {
            parts.push(`Title: ${content.metaData.title}`);
        }
        if (content.metaData.description) 
        {
            parts.push(`Description: ${content.metaData.description}`);
        }
        
        // Add GitHub-specific data
        if (content.githubData) 
        {
            parts.push('\nGitHub Profile Data:');
            if (content.githubData.username) parts.push(`Username: ${content.githubData.username}`);
            if (content.githubData.bio) parts.push(`Bio: ${content.githubData.bio}`);
            if (content.githubData.stats.length > 0) 
            {
                parts.push(`Stats: ${content.githubData.stats.join(', ')}`);
            }
        }
        
        // Add main content
        if (content.mainContent && content.mainContent.length > 0) 
        {
            parts.push('\nMain Content:');
            parts.push(...content.mainContent.slice(0, 5)); 
        }
        
        // Add structured data summary
        if (content.jsonLd && content.jsonLd.length > 0) 
        {
            parts.push('\nStructured Data Found:');
            content.jsonLd.forEach((json: string) => 
            {
                try 
                {
                    const parsed = JSON.parse(json);
                    if (parsed['@type']) parts.push(`- ${parsed['@type']}`);
                }
                catch 
                {
                    // Ignore parse errors
                }
            });
        }
        
        return parts.join('\n') || 'No content found';
    }

    /**
     * @description: Extract main content from cheerio object
     * @param {cheerio.CheerioAPI} $ - Cheerio instance
     * @returns {string[]} Array of content strings
     */
    private extractMainContent($: cheerio.CheerioAPI): string[] 
    {
        // Remove scripts and styles
        $('script, style, nav, header, footer').remove();
        
        // Try common content selectors first
        const contentSelectors = [
            'main', 'article', '[role="main"]', '#content', '.content',
            '.markdown-body', '.post-content', '.entry-content',
            '.article-body', '.story-body', 'div[itemprop="articleBody"]'
        ];
        
        for (const selector of contentSelectors) 
        {
            const element = $(selector);
            if (element.length > 0) 
            {
                const text = element.text().trim();
                if (text.length > 100) 
                {
                    // Break into paragraphs
                    return element.find('p, h1, h2, h3, li')
                        .map((_, el) => $(el).text().trim())
                        .get()
                        .filter(t => t.length > 20);
                }
            }
        }
        
        // Fall back to density-based extraction
        const blocks: {text: string, score: number}[] = [];
        
        $('div, section, article, p').each((_, el) => 
        {
            const $el = $(el);
            const text = $el.clone().children().remove().end().text().trim();
            
            if (text.length < 50) return;
            
            // Calculate content score
            const linkDensity = $el.find('a').length / (text.length / 100);
            const punctuationDensity = (text.match(/[.!?]/g) || []).length / (text.length / 100);
            const wordCount = text.split(/\s+/).length;
            
            const score = (wordCount > 10 ? 1 : 0) + 
                         (linkDensity < 0.3 ? 1 : 0) + 
                         (punctuationDensity > 0.5 ? 1 : 0);
            
            if (score >= 2) 
            {
                blocks.push({ text, score });
            }
        });
        
        // Sort by score and text length
        return blocks
            .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
            .slice(0, 10)
            .map(b => b.text);
    }

    /**
     * @description: Enhanced basic scraping with better content extraction
     * @param {string} url - The URL to scrape
     * @returns {Promise<{content: string, confidence: number}>} Scraped content with confidence score
     */
    private async enhancedBasicScrape(url: string): Promise<{content: string, confidence: number}> 
    {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            maxRedirects: 5,
            validateStatus: (status) => status < 400
        });
        
        const $ = cheerio.load(response.data);
        const domain = new URL(url).hostname;
        
        // Extract comprehensive content
        const content = {
            // Structured data
            jsonLd: $('script[type="application/ld+json"]')
                .map((_, el) => $(el).html())
                .get()
                .filter(Boolean),
            
            metaData: {
                title: $('meta[property="og:title"]').attr('content') || 
                       $('meta[name="twitter:title"]').attr('content') || 
                       $('title').text().trim(),
                description: $('meta[property="og:description"]').attr('content') || 
                            $('meta[name="description"]').attr('content') || 
                            $('meta[name="twitter:description"]').attr('content'),
                image: $('meta[property="og:image"]').attr('content') || 
                       $('meta[name="twitter:image"]').attr('content'),
                author: $('meta[name="author"]').attr('content'),
                publishedTime: $('meta[property="article:published_time"]').attr('content')
            },
            
            // Main content
            mainContent: this.extractMainContent($),
            
            // GitHub-specific selectors
            githubData: domain.includes('github.com') ? {
                username: $('.p-nickname').text().trim() || $('[itemprop="additionalName"]').text().trim(),
                name: $('.p-name').text().trim() || $('[itemprop="name"]').text().trim(),
                bio: $('.p-note').text().trim() || $('[itemprop="description"]').text().trim(),
                location: $('[itemprop="homeLocation"]').text().trim(),
                website: $('[itemprop="url"]').attr('href'),
                stats: $('.Counter').map((_, el) => $(el).text().trim()).get(),
                repositories: $('.pinned-item-list-item-content')
                    .map((_, el) => ({
                        name: $(el).find('.repo').text().trim(),
                        description: $(el).find('.pinned-item-desc').text().trim()
                    }))
                    .get()
            } : null,
            
            // Generic site data
            headings: $('h1, h2, h3')
                .map((_, el) => ({
                    level: el.name,
                    text: $(el).text().trim()
                }))
                .get()
                .slice(0, 10)
        };
        
        // Calculate confidence
        const confidence = this.calculateConfidence(content);
        
        return {
            content: this.formatContent(content),
            confidence
        };
    }

    /**
     * @description: Scrape content via API for supported sites
     * @param {string} url - The URL to fetch via API
     * @returns {Promise<string>} API fetched content
     */
    private async scrapeViaAPI(url: string): Promise<string> 
    {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        /**
         * GitHub API Integration
         */
        if (domain.includes('github.com')) 
        {
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            
            if (pathParts.length >= 1) 
            {
                const username = pathParts[0];
                
                try 
                {
                    // Fetch user data and repos in parallel
                    const [userResponse, reposResponse, eventsResponse] = await Promise.all([
                        axios.get(`https://api.github.com/users/${username}`, {
                            headers: { 'Accept': 'application/vnd.github.v3+json' },
                            timeout: 5000
                        }),
                        axios.get(`https://api.github.com/users/${username}/repos`, {
                            params: { sort: 'updated', per_page: 10 },
                            headers: { 'Accept': 'application/vnd.github.v3+json' },
                            timeout: 5000
                        }),
                        axios.get(`https://api.github.com/users/${username}/events/public`, {
                            params: { per_page: 5 },
                            headers: { 'Accept': 'application/vnd.github.v3+json' },
                            timeout: 5000
                        }).catch(() => ({ data: [] })) // Graceful fallback
                    ]);
                    
                    const user = userResponse.data;
                    const repos = reposResponse.data;
                    const events = eventsResponse.data;
                    
                    // Format the response
                    const parts = [
                        `GitHub Profile: ${user.name || username}`,
                        user.bio ? `Bio: ${user.bio}` : null,
                        user.company ? `Company: ${user.company}` : null,
                        user.location ? `Location: ${user.location}` : null,
                        user.blog ? `Website: ${user.blog}` : null,
                        `\nStats:`,
                        `- Public Repos: ${user.public_repos}`,
                        `- Followers: ${user.followers}`,
                        `- Following: ${user.following}`,
                    ].filter(Boolean);
                    
                    if (repos.length > 0) 
                    {
                        parts.push('\nRecent Repositories:');
                        repos.slice(0, 5).forEach((repo: any) => 
                        {
                            parts.push(`- ${repo.name}${repo.fork ? ' (fork)' : ''}`);
                            if (repo.description) parts.push(`  ${repo.description}`);
                            if (repo.language) parts.push(`  Language: ${repo.language}`);
                            parts.push(`  ⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count}`);
                        });
                    }
                    
                    if (events.length > 0) 
                    {
                        parts.push('\nRecent Activity:');
                        events.slice(0, 3).forEach((event: any) => 
                        {
                            const eventType = event.type.replace(/Event$/, '');
                            parts.push(`- ${eventType} in ${event.repo.name}`);
                        });
                    }
                    
                    return parts.join('\n');
                }
                catch (error) 
                {
                    throw error
                }
            }
        }
        
        /**
         * Hacker News API Integration
         */
        if (domain.includes('news.ycombinator.com')) 
        {
            try 
            {
                if (urlObj.pathname === '/' || urlObj.pathname === '/news') 
                {
                    const response = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
                    const topStoryIds = response.data.slice(0, 10);
                    
                    const stories = await Promise.all(
                        topStoryIds.map((id: number) => 
                            axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
                                .then(r => r.data)
                        )
                    );
                    
                    const parts = ['Hacker News Top Stories:\n'];
                    stories.forEach((story, i) => 
                    {
                        parts.push(`${i + 1}. ${story.title}`);
                        parts.push(`   ${story.score} points | ${story.descendants || 0} comments`);
                        if (story.url) parts.push(`   ${story.url}`);
                    });
                    
                    return parts.join('\n');
                }
            }
            catch 
            {
            }
        }
        
        // No API available for this site
        throw new Error('No API available for this site');
    }

    /**
     * @description: Main scraping method with tiered strategy
     * @param {string} url - The URL to scrape
     * @returns {Promise<string>} Scraped content or error
     */
    private async scrapeWebsite(url: string): Promise<string>
    {
        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
        const now = Date.now() / 1000;
        
        // Check cache with dynamic TTL
        const cacheKey = this.getCacheKey(normalizedUrl);
        const cached = this.cache.get(cacheKey);
        if (cached && (now - cached.timestamp) < cached.ttl)
        {
            return `Cached content from ${normalizedUrl}:\n${'='.repeat(30)}\n${cached.content}`;
        }

        try 
        {
            const domain = new URL(normalizedUrl).hostname.replace('www.', '');
            
            /**
             * Tier 1: Try API first for supported sites
             */
            if (domain in this.strategies.api) 
            {
                try 
                {
                    const apiContent = await this.scrapeViaAPI(normalizedUrl);
                    const ttl = this.getCacheTTL(normalizedUrl);
                    this.updateCache(cacheKey, apiContent, ttl);
                    
                    return `API content from ${normalizedUrl}:\n${'='.repeat(30)}\n${apiContent}`;
                }
                catch (apiError) 
                {
                    console.error('API scraping failed, falling back to web scraping:', apiError);
                }
            }
            
            /**
             * Tier 2: Enhanced basic scraping
             */
            const { content, confidence } = await this.enhancedBasicScrape(normalizedUrl);
            
            if (confidence > 0.5 || this.strategies.basic.includes(domain)) 
            {
                const ttl = this.getCacheTTL(normalizedUrl);
                this.updateCache(cacheKey, content, ttl);
                
                return `Scraped content from ${normalizedUrl} (confidence: ${(confidence * 100).toFixed(0)}%):\n${'='.repeat(30)}\n${content}`;
            }
            
            /**
             * Tier 3: For dynamic sites or low confidence
             */
            if (this.strategies.dynamic.includes(domain)) 
            {
                const warning = '\n\n⚠️ Note: This site loads content dynamically. Some information may be missing.';
                const contentWithWarning = content + warning;
                
                const ttl = Math.min(this.getCacheTTL(normalizedUrl), 600); // Shorter TTL for dynamic sites
                this.updateCache(cacheKey, contentWithWarning, ttl);
                
                return `Scraped content from ${normalizedUrl} (dynamic site):\n${'='.repeat(30)}\n${contentWithWarning}`;
            }
            
            const ttl = this.getCacheTTL(normalizedUrl);
            this.updateCache(cacheKey, content, ttl);
            
            return `Scraped content from ${normalizedUrl}:\n${'='.repeat(30)}\n${content}`;
        }
        catch (error) 
        {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            const cached = this.cache.get(cacheKey);
            if (cached && errorMessage.includes('ETIMEDOUT')) 
            {
                return `Cached content from ${normalizedUrl} (network timeout):\n${'='.repeat(30)}\n${cached.content}`;
            }
            
            return `Error scraping ${normalizedUrl}: ${errorMessage}`;
        }
    }

    /**
     * @description: Update cache with size management
     * @param {string} key - Cache key
     * @param {string} content - Content to cache
     * @param {number} ttl - Time to live in seconds
     */
    private updateCache(key: string, content: string, ttl: number): void 
    {
        const now = Date.now() / 1000;
        
        if (this.cache.size >= this.cacheSizeLimit) 
        {
            const entries = Array.from(this.cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            // Remove oldest 10% to make room
            const toRemove = Math.ceil(this.cacheSizeLimit * 0.1);
            for (let i = 0; i < toRemove; i++) 
            {
                this.cache.delete(entries[i][0]);
            }
        }
        
        this.cache.set(key, { content, timestamp: now, ttl });
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
        console.error('Optimized web search server v2.0.0 running...');
    }
}

// Start the server
const webSearch = new WebSearch();
webSearch.run().catch(console.error);