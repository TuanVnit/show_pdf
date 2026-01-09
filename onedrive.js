const fs = require('fs');
const path = require('path');
require('isomorphic-fetch');
const { Client } = require('@microsoft/microsoft-graph-client');

class OneDriveService {
    constructor(tenantId, clientId, clientSecret, userId = null) {
        this.tenantId = tenantId;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.userId = userId;
        this.accessToken = null;
        this.tokenExpires = 0;
        this.client = null;
    }

    async getAccessToken() {
        if (this.accessToken && Date.now() < this.tokenExpires) return this.accessToken;

        const params = new URLSearchParams();
        params.append('client_id', this.clientId);
        params.append('client_secret', this.clientSecret);
        params.append('scope', 'https://graph.microsoft.com/.default');
        params.append('grant_type', 'client_credentials');

        const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

        // console.log('[OneDrive] Requesting Access Token...');
        const res = await fetch(tokenUrl, { method: 'POST', body: params });
        const data = await res.json();

        if (!data.access_token) {
            console.error('[OneDrive] Token Error:', data);
            throw new Error('Cannot get access token: ' + (data.error_description || JSON.stringify(data)));
        }

        this.accessToken = data.access_token;
        this.tokenExpires = Date.now() + (data.expires_in * 1000) - 60000;
        return this.accessToken;
    }

    async getClient() {
        const token = await this.getAccessToken();
        return Client.init({
            authProvider: (done) => done(null, token)
        });
    }

    async getDrive() {
        const client = await this.getClient();
        // Try to get default drive (often SharePoint default doc lib for empty context)
        // OR if needed, list users and pick first one to use their drive
        try {
            // For App-Only, 'me/drive' fails. We need a target resource.
            // Try getting list of users to find a target user
            const users = await client.api('/users').top(1).get();
            if (users.value && users.value.length > 0) {
                const userId = users.value[0].id;
                console.log(`[OneDrive] Using Drive of User: ${users.value[0].userPrincipalName} (${userId})`);
                return client.api(`/users/${userId}/drive`);
            }
            throw new Error('No users found to access Drive');
        } catch (e) {
            console.error('[OneDrive] Error finding target drive:', e);
            throw e;
        }
    }

    async uploadAndGetLink(localPath, remoteFolder = 'Uploads') {
        try {
            const client = await this.getClient();
            const fileName = path.basename(localPath);
            const fileContent = fs.readFileSync(localPath);

            // 1. Determine Target User
            let targetId = this.userId;
            if (!targetId) {
                // Fallback auto-discovery
                const users = await client.api('/users').top(1).get();
                if (!users.value || users.value.length === 0) throw new Error('No users found in Tenant');
                targetId = users.value[0].id;
                console.log(`[OneDrive] Auto-selected user: ${users.value[0].userPrincipalName}`);
            }

            // 2. Upload File (PUT /users/{id}/drive/root:/{folder}/{name}:/content)
            const targetPath = `/users/${targetId}/drive/root:/${remoteFolder}/${fileName}:/content`;
            console.log(`[OneDrive] Uploading to UserID ${targetId} -> ${remoteFolder}/${fileName}...`);

            const uploadRes = await client.api(targetPath).put(fileContent);
            const itemId = uploadRes.id;
            console.log(`[OneDrive] Uploaded. Item ID: ${itemId}`);

            // 3. Create Sharing Link
            // POST /users/{id}/drive/items/{itemId}/createLink
            const linkRes = await client.api(`/users/${targetId}/drive/items/${itemId}/createLink`)
                .post({
                    type: 'edit',
                    scope: 'anonymous' // Use 'organization' if Anonymous is disabled by policy
                });

            console.log('[OneDrive] Link Created:', linkRes.link.webUrl);
            return linkRes.link.webUrl;
        } catch (error) {
            console.error('[OneDrive] Process Error:', error);
            // Hint for common errors
            if (error.statusCode === 404) throw new Error('User Drive not found (User might not have OneDrive license/setup)');
            throw error;
        }
    }
}

module.exports = OneDriveService;
