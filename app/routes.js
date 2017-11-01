const google = require('googleapis')

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
    const {install, authentications = {}} = request.body
    const authenticated = !!(authentications.account && authentications.account.token)

    if (!authenticated) {
      // User has logged out. Reset schema.
      Object.assign(install.schema.properties.id, {
        enum: null,
        enumNames: null
      })

      install.options.id = ''
      install.links = []

      response.json({install, proceed: true})
      return
    }

    function handleAPIError (error) {
      console.error('API Error', error)

      response.json({
        proceed: false,
        errors: [{type: '400', message: error.toString()}]
      })
    }

    oauth2Client.setCredentials({
      access_token: request.body.authentications.account.token.token
    })

    const fetchAccountSummaries = new Promise((resolve, reject) => {
      analytics.management.accountSummaries.list({}, (error, accountSummaries) => {
        if (error) return reject(error)

        return resolve(accountSummaries)
      })
    })

    // const createAccount = new Promise((resolve, reject) => {
    //   console.log('createAccount')
    // })

    const checkAnalyticsAccount = new Promise((resolve, reject) => {
      analytics.management.accounts.list({}, (error, accounts) => {
        if (error) {
          // if (error.code === 403) return resolve(createAccount)
          return reject(error)
        }

        return resolve(accounts)
      })
    })

    checkAnalyticsAccount
      .catch(handleAPIError)
      .then(() => fetchAccountSummaries)
      .catch(handleAPIError)
      .then(accountSummaries => {
        const accountIds = []
        const accountIdNames = {}
        const webPropertyPrefix = 'web-properties-for-'

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

        accountSummaries.items.forEach((account, index) => {
          const schemaName = webPropertyPrefix + account.id
          const webPropertyIds = []
          const webPropertyNames = {}

          account.webProperties.forEach(property => {
            webPropertyIds.push(property.id)
            webPropertyNames[property.id] = property.name
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
        })

        webPropertyTemplate.type = 'hidden'

        response.json({install})
      })
      .catch(handleAPIError)
  })

  // "item-add"
  app.post('/provision-property', function (request, response) {
    const {install, metadata} = request.body

    console.log(request.body)
    oauth2Client.setCredentials({
      access_token: request.body.authentications.account.token.token
    })

    // const account =

    analytics.management.webproperties.insert({
      accountId: '123456',
      resource: {
        websiteUrl: metadata.item.url,
        name: metadata.item.name
      }
    })

    response.json({install})
  })

  app.post('/post-install', function (request, response) {
    const {install} = request.body

    // Include link to Google Analytics Dashboard.
    // TODO: Is it possible to link to a particular web property?
    install.links = [{
      title: 'Google Analytics',
      description: 'Visit Google Analytics to track your site\'s activity.',
      href: 'https://analytics.google.com'
    }]

    response.json({install})
  })

  // Account metadata handler.
  // This handler fetches user info and populates the login entry with user's email address.
  app.get('/account-metadata', function (request, response) {
    oauth2Client.setCredentials({
      access_token: request.headers.authorization.replace('Bearer ', '')
    })

    oauth.userinfo.v2.me.get({}, (error, userInfo) => {
      if (error) {
        response.json({
          proceed: false,
          errors: [{type: '400', message: error.toString()}]
        })
        return
      }

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
