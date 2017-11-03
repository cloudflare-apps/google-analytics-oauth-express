const google = require('googleapis')
const WEB_PROPERTY_PREFIX = 'web-properties-for-'
const webPropertyLabel = property => `${property.name} (${property.id})`

function createErrorHandler (response, prefix) {
  return function handleAPIError (error) {
    console.error(prefix, error)

    response.json({
      proceed: false,
      errors: [{type: '400', message: error.toString()}]
    })
  }
}

module.exports = function setRoutes (app) {
  const {OAuth2} = google.auth
  const oauth2Client = new OAuth2(
    app.get('clientID'),
    app.get('clientSecret'),
    'https://www.cloudflare.com/apps/oauth/'
  )

  google.options({auth: oauth2Client})

  const analytics = google.analytics('v3')
  const oauth = google.oauth2('v2')

  // Primary OAuth request handler.
  // This handler fetches Google Analytics account summaries,
  // then populates an install field with the entries.
  app.post('/', function (request, response) {
    const handleAPIError = createErrorHandler(response, 'OAuth Login API Error')
    const {install, authentications = {}} = request.body
    const authenticated = !!(authentications.account && authentications.account.token)

    install.schema.properties.noAccountHelp.type = 'hidden'

    if (!authenticated) {
      // User has logged out. Reset schema.
      const {webPropertySchemaNames = []} = install.options

      webPropertySchemaNames.forEach(schemaName => {
        delete install.schema.properties[schemaName]
        delete install.options[webPropertySchemaNames]
      })

      Object.assign(install.schema.properties.organization, {
        enum: null,
        enumNames: null
      })

      install.options.organization = ''

      install.options.id = ''
      install.links = []

      response.json({install, proceed: true})
      return
    }

    oauth2Client.setCredentials({
      access_token: request.body.authentications.account.token.token
    })

    const checkAnalyticsAccount = () => new Promise((resolve, reject) => {
      analytics.management.accounts.list({}, (error, accounts) => {
        if (error) return reject(error)

        return resolve(accounts)
      })
    })

    const fetchAccountSummaries = () => new Promise((resolve, reject) => {
      analytics.management.accountSummaries.list({}, (error, accountSummaries) => {
        if (error) return reject(error)

        return resolve(accountSummaries)
      })
    })

    checkAnalyticsAccount()
      .then(() => {
        fetchAccountSummaries()
          .then(accountSummaries => {
            const accountIds = []
            const accountIdNames = {}

            // Populate each account as an "Organization".
            accountSummaries.items.forEach((account, index) => {
              accountIds.push(account.id)
              accountIdNames[account.id] = account.name
            })

            Object.assign(install.schema.properties.organization, {
              enum: accountIds,
              enumNames: accountIdNames,
              default: accountIds[0]
            })

            install.options.organization = accountIds[0]

            // Populate each organization's web properties.
            const {webPropertyTemplate} = install.schema.properties
            const namePattern = /\$ORGANIZATION/g

            install.options.webPropertySchemaNames = []

            accountSummaries.items.forEach((account, index) => {
              const schemaName = WEB_PROPERTY_PREFIX + account.id
              const webPropertyIds = []
              const webPropertyNames = {}

              account.webProperties.forEach(property => {
                webPropertyIds.push(property.id)
                webPropertyNames[property.id] = webPropertyLabel(property)
              })

              install.schema.properties[schemaName] = Object.assign({}, webPropertyTemplate, {
                showIf: {
                  organization: account.id
                },
                type: 'string',
                title: webPropertyTemplate.title.replace(namePattern, account.name),
                order: webPropertyTemplate.order + index,
                default: webPropertyIds[0],
                enum: webPropertyIds,
                enumNames: webPropertyNames
              })

              install.options[schemaName] = webPropertyIds[0]
              install.options.webPropertySchemaNames.push(schemaName)
            })

            response.json({install})
          })
          .catch(handleAPIError)
      })
      .catch(error => {
        if (error.code !== 403) return handleAPIError(error)

        // Customer does not have a Google Analytics account.
        install.schema.properties.noAccountHelp.type = 'help'
        install.options.account = null

        response.json({install})
      })
  })

  app.post('/provision', function (request, response) {
    const handleAPIError = createErrorHandler(response, 'Google Analytics Provision API Error')
    const {install, metadata} = request.body

    oauth2Client.setCredentials({
      access_token: request.body.authentications.account.token.token
    })

    if (metadata.key.startsWith(WEB_PROPERTY_PREFIX)) {
      analytics.management.webproperties.insert({
        accountId: metadata.key.replace(WEB_PROPERTY_PREFIX, ''),
        resource: {
          websiteUrl: metadata.item.url,
          name: metadata.item.name
        }
      }, (error, property) => {
        if (error) {
          return handleAPIError(error)
        }

        const schemaEntry = install.schema.properties[metadata.key]

        schemaEntry.enum = schemaEntry.enum || []
        schemaEntry.enumNames = schemaEntry.enumNames || {}

        schemaEntry.enum.push(property.id)
        schemaEntry.enumNames[property.id] = webPropertyLabel(property)

        install.options[metadata.key] = property.id

        response.json({install})
      })
    } else if (metadata.key === 'organization') {
      // analytics.provisioning.createAccountTicket()
      handleAPIError(new Error('Account creation not yet supported.'))
    } else {
      handleAPIError(new Error(`Unknown metadata key ${metadata.key}`))
    }
  })

  app.post('/post-install', function (request, response) {
    const {install} = request.body
    const link = {
      title: 'Google Analytics',
      description: 'Visit Google Analytics to track your site\'s activity.',
      href: 'https://analytics.google.com'
    }

    install.links = [link]
    response.json({install})
  })

  // Account metadata handler.
  // This handler fetches user info and populates the login entry with user's email address.
  app.get('/account-metadata', function (request, response) {
    const handleAPIError = createErrorHandler(response, 'Metadata API Error')

    oauth2Client.setCredentials({
      access_token: request.headers.authorization.replace('Bearer ', '')
    })

    oauth.userinfo.v2.me.get({}, (error, userInfo) => {
      if (error) return handleAPIError(error)

      response.json({
        metadata: {
          email: userInfo.email,
          username: userInfo.email,
          userId: userInfo.id
        }
      })
    })
  })

  app.get('/healthcheck', function (request, response) {
    response.sendStatus(200)
  })
}
