const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');

const TOKEN_CACHE_FILE = path.join(__dirname, '.onedrive-token-cache.json');

class OneDriveOAuthService {
    constructor(tenantId, clientId, clientSecret, redirectUri) {
        this.tenantId = tenantId || 'common';
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;

        this.msalConfig = {
            auth: {
                clientId: this.clientId,
                authority: `https://login.microsoftonline.com/${this.tenantId}`,
                clientSecret: this.clientSecret
            }
        };

        this.pca = new msal.ConfidentialClientApplication(this.msalConfig);
        this.tokenCache = this.loadTokenCache();
    }

    loadTokenCache() {
        try {
            if (fs.existsSync(TOKEN_CACHE_FILE)) {
                return JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
            }
        } catch (e) {
            console.error('[OAuth] Failed to load token cache:', e);
        }
        return null;
    }

    saveTokenCache(tokenResponse) {
        try {
            console.log('[OAuth] Token Response Keys:', Object.keys(tokenResponse));

            // MSAL returns different structure, need to extract properly
            const cache = {
                accessToken: tokenResponse.accessToken,
                refreshToken: tokenResponse.refreshToken || null,
                expiresOn: tokenResponse.expiresOn,
                account: tokenResponse.account ? {
                    homeAccountId: tokenResponse.account.homeAccountId,
                    username: tokenResponse.account.username
                } : null
            };

            console.log('[OAuth] Saving token cache:', {
                hasAccessToken: !!cache.accessToken,
                hasRefreshToken: !!cache.refreshToken,
                expiresOn: cache.expiresOn,
                username: cache.account?.username
            });

            fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache, null, 2));
            this.tokenCache = cache;
        } catch (e) {
            console.error('[OAuth] Failed to save token cache:', e);
        }
    }

    getAuthUrl() {
        const authCodeUrlParameters = {
            scopes: ['Files.ReadWrite', 'offline_access'],
            redirectUri: this.redirectUri,
            prompt: 'consent' // Force consent screen to ensure refresh token
        };

        return this.pca.getAuthCodeUrl(authCodeUrlParameters);
    }

    async handleCallback(code) {
        const tokenRequest = {
            code: code,
            scopes: ['Files.ReadWrite', 'offline_access'],
            redirectUri: this.redirectUri
        };

        const response = await this.pca.acquireTokenByCode(tokenRequest);
        this.saveTokenCache(response);
        return response;
    }

    async getAccessToken() {
        if (this.tokenCache && this.tokenCache.accessToken) {
            const expiresOn = new Date(this.tokenCache.expiresOn);
            if (expiresOn > new Date()) {
                console.log('[OAuth] Using cached access token');
                return this.tokenCache.accessToken;
            }
        }

        if (this.tokenCache && this.tokenCache.refreshToken) {
            try {
                console.log('[OAuth] Refreshing access token...');
                const refreshRequest = {
                    refreshToken: this.tokenCache.refreshToken,
                    scopes: ['Files.ReadWrite', 'offline_access']
                };

                const response = await this.pca.acquireTokenByRefreshToken(refreshRequest);
                this.saveTokenCache(response);
                return response.accessToken;
            } catch (e) {
                console.error('[OAuth] Failed to refresh token:', e);
                this.tokenCache = null;
            }
        }

        throw new Error('No valid token. User needs to login.');
    }

    isAuthenticated() {
        if (!this.tokenCache || !this.tokenCache.accessToken) return false;
        const expiresOn = new Date(this.tokenCache.expiresOn);
        return expiresOn > new Date();
    }

    async uploadAndGetLink(localPath, remoteFolder = 'uploads') {
        try {
            const accessToken = await this.getAccessToken();

            const client = Client.init({
                authProvider: (done) => done(null, accessToken)
            });

            // Build remote path from local path
            // Local: E:\RAG\Preview_folder\uploads\{extractId}\{filePath}
            // Remote: /uploads/{extractId}/{filePath}
            const uploadsIndex = localPath.indexOf('uploads');
            if (uploadsIndex === -1) {
                throw new Error('File is not in uploads folder');
            }

            const relativePath = localPath.substring(uploadsIndex + 'uploads'.length + 1).replace(/\\/g, '/');
            const targetPath = `/me/drive/root:/${remoteFolder}/${relativePath}:/content`;

            console.log(`[OAuth] Uploading to OneDrive: ${remoteFolder}/${relativePath}`);

            // Read and upload file directly
            const fileContent = fs.readFileSync(localPath);
            const uploadRes = await client.api(targetPath).put(fileContent);
            const itemId = uploadRes.id;
            console.log(`[OAuth] Uploaded successfully. Item ID: ${itemId}`);

            // Create Sharing Link
            const linkRes = await client.api(`/me/drive/items/${itemId}/createLink`)
                .post({
                    type: 'edit',
                    scope: 'anonymous'
                });

            console.log('[OAuth] Edit Link Created:', linkRes.link.webUrl);
            return linkRes.link.webUrl;
        } catch (error) {
            console.error('[OAuth] Upload Error:', error);
            if (error.message && error.message.includes('No valid token')) {
                throw new Error('AUTH_REQUIRED');
            }
            throw error;
        }
    }
}

module.exports = OneDriveOAuthService;
