# Google Analytics OAuth Express

This is a Express service that fetches a user's Google Analytics IDs for
the [GoogleAnalytics](https://github.com/CloudflareApps/GoogleAnalytics) app.

## Local Setup

### Requirements

- Node 6.3.1+
- Cloudflare account
- Google account

Fill in your credentials in _credentials.json_ from the
[Google Developer Console](https://console.developers.google.com/apis/credentials)

### Usage

- `npm install`
- `npm start`

## Cloudflare Service Configuration

After signing in with Cloudflare account,
[create a new service](https://www.cloudflare.com/apps/services/new) with the following configuration.

| Field                    | Value                                                                                              |
|--------------------------|----------------------------------------------------------------------------------------------------|
| OAuth Authentication URL | https://accounts.google.com/o/oauth2/v2/auth                                                       |
| OAuth Client ID          | _via Google Developer Console_                                                                     |
| OAuth Scope              | https://www.googleapis.com/auth/analytics.readonly, https://www.googleapis.com/auth/userinfo.email |
| OAuth Token URL          | https://www.googleapis.com/oauth2/v4/token                                                         |
| OAuth Client Secret      | _via Google Developer Console_                                                                     |
| Metadata Endpoint        | https://yourservicedomain.com/account-metadata                                                     |
