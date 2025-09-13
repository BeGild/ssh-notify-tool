#!/usr/bin/env node
/**
 * Plugin Packaging Tool for SSH Notify Tool
 * Validates, packages, and distributes notification plugins
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const PLUGIN_TEMPLATE_DIR = path.join(__dirname, '../plugin-examples');
const OUTPUT_DIR = path.join(process.cwd(), 'dist');

// Color codes for output
const colors = {
    reset: '\033[0m',
    red: '\033[0;31m',
    green: '\033[0;32m',
    yellow: '\033[1;33m',
    blue: '\033[0;34m',
    cyan: '\033[0;36m'
};

// Logging functions
const log = (message, color = colors.reset) => {
    console.log(`${color}${message}${colors.reset}`);
};

const logInfo = (message) => log(`[INFO] ${message}`, colors.blue);
const logSuccess = (message) => log(`[SUCCESS] ${message}`, colors.green);
const logWarning = (message) => log(`[WARNING] ${message}`, colors.yellow);
const logError = (message) => log(`[ERROR] ${message}`, colors.red);

class PluginPackager {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Main packaging function
     */
    async packagePlugin(pluginPath, options = {}) {
        try {
            logInfo('Starting plugin packaging process...');
            
            // Resolve plugin path
            const absolutePluginPath = path.resolve(pluginPath);
            logInfo(`Plugin path: ${absolutePluginPath}`);
            
            // Load and validate plugin
            const pluginInfo = await this.loadPluginInfo(absolutePluginPath);
            logInfo(`Found plugin: ${pluginInfo.name} v${pluginInfo.version}`);
            
            // Validate plugin structure
            await this.validatePlugin(absolutePluginPath, pluginInfo);
            
            // Create package
            const packageInfo = await this.createPackage(absolutePluginPath, pluginInfo, options);
            
            // Generate checksums
            await this.generateChecksums(packageInfo);
            
            logSuccess('Plugin packaging completed successfully!');
            this.showSummary(packageInfo);
            
            return packageInfo;
            
        } catch (error) {
            logError(`Packaging failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load plugin information from package.json
     */
    async loadPluginInfo(pluginPath) {
        const packageJsonPath = path.join(pluginPath, 'package.json');
        
        try {
            const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);
            
            // Extract plugin metadata
            const pluginInfo = {
                name: packageJson.name,
                version: packageJson.version,
                description: packageJson.description,
                author: packageJson.author,
                license: packageJson.license,
                dependencies: packageJson.dependencies || {},
                peerDependencies: packageJson.peerDependencies || {},
                keywords: packageJson.keywords || [],
                repository: packageJson.repository,
                homepage: packageJson.homepage,
                main: packageJson.main || 'index.js'
            };
            
            // Validate required fields
            const requiredFields = ['name', 'version', 'main'];
            for (const field of requiredFields) {
                if (!pluginInfo[field]) {
                    throw new Error(`Missing required field in package.json: ${field}`);
                }
            }
            
            // Check plugin naming convention
            if (!pluginInfo.name.startsWith('ssh-notify-plugin-')) {
                logWarning('Plugin name should start with "ssh-notify-plugin-"');
            }
            
            return pluginInfo;
            
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('package.json not found in plugin directory');
            }
            throw error;
        }
    }

    /**
     * Validate plugin structure and code
     */
    async validatePlugin(pluginPath, pluginInfo) {
        logInfo('Validating plugin structure...');
        
        // Check main file exists
        const mainFilePath = path.join(pluginPath, pluginInfo.main);
        try {
            await fs.access(mainFilePath);
        } catch (error) {
            throw new Error(`Main file not found: ${pluginInfo.main}`);
        }
        
        // Load and validate plugin class
        try {
            delete require.cache[require.resolve(mainFilePath)];
            const PluginClass = require(mainFilePath);
            
            // Check if it's a class
            if (typeof PluginClass !== 'function') {
                throw new Error('Plugin main file must export a class');
            }
            
            // Check static metadata
            if (!PluginClass.metadata) {
                throw new Error('Plugin class must have static metadata property');
            }
            
            const metadata = PluginClass.metadata;
            
            // Validate metadata structure
            const requiredMetadata = ['name', 'displayName', 'version', 'description'];
            for (const field of requiredMetadata) {
                if (!metadata[field]) {
                    throw new Error(`Missing required metadata field: ${field}`);
                }
            }
            
            // Validate configuration schema
            if (metadata.configSchema) {
                if (typeof metadata.configSchema !== 'object') {
                    throw new Error('configSchema must be an object');
                }
                
                if (!metadata.configSchema.type || metadata.configSchema.type !== 'object') {
                    this.warnings.push('configSchema should have type: "object"');
                }
                
                if (!metadata.configSchema.properties) {
                    this.warnings.push('configSchema should have properties defined');
                }
            }
            
            // Check for BasePlugin inheritance
            const pluginInstance = new PluginClass({});
            const requiredMethods = ['send', 'validate', 'isAvailable'];
            
            for (const method of requiredMethods) {
                if (typeof pluginInstance[method] !== 'function') {
                    throw new Error(`Plugin must implement ${method} method`);
                }
            }
            
            logSuccess('Plugin structure validation passed');
            
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error(`Failed to load plugin: ${error.message}`);
            }
            throw error;
        }
        
        // Check for common files
        const commonFiles = ['README.md', 'LICENSE', '.gitignore'];
        for (const file of commonFiles) {
            try {
                await fs.access(path.join(pluginPath, file));
                logInfo(`Found ${file}`);
            } catch (error) {
                logWarning(`Missing recommended file: ${file}`);
            }
        }
        
        // Check for test files
        const testDirs = ['test', 'tests', '__tests__'];
        let hasTests = false;
        
        for (const testDir of testDirs) {
            try {
                const testDirPath = path.join(pluginPath, testDir);
                const stats = await fs.stat(testDirPath);
                if (stats.isDirectory()) {
                    hasTests = true;
                    logInfo(`Found test directory: ${testDir}`);
                    break;
                }
            } catch (error) {
                // Test directory doesn't exist
            }
        }
        
        if (!hasTests) {
            logWarning('No test directory found');
        }
    }

    /**
     * Create plugin package
     */
    async createPackage(pluginPath, pluginInfo, options) {
        logInfo('Creating package...');
        
        // Create output directory
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        // Package filename
        const packageName = `${pluginInfo.name}-${pluginInfo.version}.tgz`;
        const packagePath = path.join(OUTPUT_DIR, packageName);
        
        // Create tarball using npm pack
        try {
            logInfo('Running npm pack...');
            const packOutput = execSync('npm pack', {
                cwd: pluginPath,
                encoding: 'utf8'
            });
            
            // Move the generated tarball to output directory
            const generatedPackage = packOutput.trim();
            const generatedPackagePath = path.join(pluginPath, generatedPackage);
            
            await fs.rename(generatedPackagePath, packagePath);
            logSuccess(`Package created: ${packagePath}`);
            
        } catch (error) {
            throw new Error(`Failed to create package: ${error.message}`);
        }
        
        // Get package statistics
        const stats = await fs.stat(packagePath);
        
        return {
            name: pluginInfo.name,
            version: pluginInfo.version,
            packagePath: packagePath,
            size: stats.size,
            created: new Date().toISOString()
        };
    }

    /**
     * Generate checksums for the package
     */
    async generateChecksums(packageInfo) {
        logInfo('Generating checksums...');
        
        const packageContent = await fs.readFile(packageInfo.packagePath);
        
        const checksums = {
            md5: crypto.createHash('md5').update(packageContent).digest('hex'),
            sha1: crypto.createHash('sha1').update(packageContent).digest('hex'),
            sha256: crypto.createHash('sha256').update(packageContent).digest('hex')
        };
        
        // Write checksums file
        const checksumPath = packageInfo.packagePath + '.checksums';
        const checksumContent = Object.entries(checksums)
            .map(([algo, hash]) => `${algo}:${hash}`)
            .join('\n') + '\n';
        
        await fs.writeFile(checksumPath, checksumContent);
        
        packageInfo.checksums = checksums;
        packageInfo.checksumPath = checksumPath;
        
        logSuccess('Checksums generated');
    }

    /**
     * Show packaging summary
     */
    showSummary(packageInfo) {
        console.log('\n' + '='.repeat(60));
        console.log('PACKAGING SUMMARY');
        console.log('='.repeat(60));
        console.log(`Plugin Name: ${packageInfo.name}`);
        console.log(`Version: ${packageInfo.version}`);
        console.log(`Package: ${packageInfo.packagePath}`);
        console.log(`Size: ${(packageInfo.size / 1024).toFixed(2)} KB`);
        console.log(`Created: ${packageInfo.created}`);
        console.log(`MD5: ${packageInfo.checksums.md5}`);
        console.log(`SHA256: ${packageInfo.checksums.sha256}`);
        
        if (this.warnings.length > 0) {
            console.log('\nWarnings:');
            this.warnings.forEach(warning => logWarning(warning));
        }
        
        console.log('\nInstallation:');
        console.log(`npm install ${packageInfo.packagePath}`);
        console.log('\nOr copy to plugin directory:');
        console.log(`cp ${packageInfo.packagePath} ~/.notifytool/plugins/`);
        console.log('='.repeat(60));
    }

    /**
     * Create plugin from template
     */
    async createFromTemplate(templateName, pluginName, options = {}) {
        logInfo(`Creating plugin from template: ${templateName}`);
        
        const templatePath = path.join(PLUGIN_TEMPLATE_DIR, `${templateName}-template`);
        const pluginPath = path.join(process.cwd(), pluginName);
        
        // Check if template exists
        try {
            await fs.access(templatePath);
        } catch (error) {
            throw new Error(`Template not found: ${templateName}`);
        }
        
        // Check if target directory already exists
        try {
            await fs.access(pluginPath);
            throw new Error(`Directory already exists: ${pluginName}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        
        // Copy template
        await this.copyDirectory(templatePath, pluginPath);
        
        // Process template variables
        await this.processTemplate(pluginPath, {
            PLUGIN_NAME: pluginName,
            PLUGIN_CLASS: this.toPascalCase(pluginName),
            PLUGIN_DISPLAY_NAME: this.toDisplayName(pluginName),
            AUTHOR: options.author || 'Your Name',
            VERSION: options.version || '1.0.0',
            DESCRIPTION: options.description || `${pluginName} notification plugin`
        });
        
        logSuccess(`Plugin created: ${pluginPath}`);
        console.log('\nNext steps:');
        console.log(`1. cd ${pluginName}`);
        console.log('2. npm install');
        console.log('3. Edit the plugin code');
        console.log('4. npm test');
        console.log('5. npm run package');
    }

    /**
     * Copy directory recursively
     */
    async copyDirectory(source, destination) {
        await fs.mkdir(destination, { recursive: true });
        
        const entries = await fs.readdir(source, { withFileTypes: true });
        
        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destinationPath = path.join(destination, entry.name);
            
            if (entry.isDirectory()) {
                await this.copyDirectory(sourcePath, destinationPath);
            } else {
                await fs.copyFile(sourcePath, destinationPath);
            }
        }
    }

    /**
     * Process template variables in files
     */
    async processTemplate(pluginPath, variables) {
        const processFile = async (filePath) => {
            let content = await fs.readFile(filePath, 'utf8');
            
            for (const [key, value] of Object.entries(variables)) {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                content = content.replace(regex, value);
            }
            
            await fs.writeFile(filePath, content);
        };
        
        const processDirectory = async (dirPath) => {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    await processDirectory(entryPath);
                } else if (entry.name.endsWith('.js') || 
                          entry.name.endsWith('.json') || 
                          entry.name.endsWith('.md')) {
                    await processFile(entryPath);
                }
            }
        };
        
        await processDirectory(pluginPath);
    }

    /**
     * Convert string to PascalCase
     */
    toPascalCase(str) {
        return str
            .split(/[-_\s]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    /**
     * Convert string to display name
     */
    toDisplayName(str) {
        return str
            .split(/[-_\s]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    const packager = new PluginPackager();
    
    try {
        switch (command) {
            case 'package':
                if (args.length < 2) {
                    console.error('Usage: package-plugin.js package <plugin-directory>');
                    process.exit(1);
                }
                await packager.packagePlugin(args[1]);
                break;
                
            case 'create':
                if (args.length < 3) {
                    console.error('Usage: package-plugin.js create <template> <plugin-name> [options]');
                    process.exit(1);
                }
                
                const options = {};
                for (let i = 3; i < args.length; i += 2) {
                    const key = args[i].replace(/^--/, '');
                    const value = args[i + 1];
                    options[key] = value;
                }
                
                await packager.createFromTemplate(args[1], args[2], options);
                break;
                
            case 'help':
            case '--help':
            case '-h':
                showHelp();
                break;
                
            default:
                console.error('Unknown command:', command);
                showHelp();
                process.exit(1);
        }
        
    } catch (error) {
        logError(error.message);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
SSH Notify Tool Plugin Packager

Usage:
  package-plugin.js package <plugin-directory>      Package an existing plugin
  package-plugin.js create <template> <plugin-name> Create plugin from template
  package-plugin.js help                            Show this help

Package Command:
  package <plugin-directory>    Package the plugin in the specified directory
  
  Example:
    package-plugin.js package ./my-plugin

Create Command:
  create <template> <plugin-name> [options]
  
  Templates:
    basic      Basic notification plugin
    webhook    Webhook-based plugin
    database   Database logging plugin
    
  Options:
    --author "Your Name"        Plugin author
    --version "1.0.0"          Plugin version
    --description "Description" Plugin description
  
  Example:
    package-plugin.js create webhook my-webhook-plugin --author "John Doe"

Output:
  Packaged plugins are saved to ./dist/
  Includes .tgz package file and .checksums file
`);
}

// Run CLI if called directly
if (require.main === module) {
    main();
}

module.exports = PluginPackager;