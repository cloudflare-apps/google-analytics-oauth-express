# Google Analytics OAuth Service

This is a Cloudflare service that fetches a user's Google Analytics IDs for
the [GoogleAnalytics](https://github.com/CloudflareApps/GoogleAnalytics) app.

## Local Setup

Fill in your credentials in _credentials.json_ from the
[Google Developer Console](https://console.developers.google.com/apis/credentials)

- `npm install`
- `npm start`

## Cloudflare Service Configuration

| Field                    | Value                                              |
|--------------------------|----------------------------------------------------|
| OAuth Authentication URL | https://accounts.google.com/o/oauth2/v2/auth       |
| OAuth Client ID          | _via Google Developer Console_                     |
| OAuth Scope              | https://www.googleapis.com/auth/analytics.readonly |
| OAuth Token URL          | https://www.googleapis.com/oauth2/v4/token         |
| OAuth Client Secret      | _via Google Developer Console_                     |

