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
    const {install} = request.body

    if (!request.body.metadata.newValue) {
      // User has logged out. Reset schema.

      Object.assign(install.schema.properties.id, {
        enum: null,
        enumNames: null
      })

      install.options.id = ''

      response.json({install, proceed: true})
      return
    }

    oauth2Client.setCredentials({
      access_token: request.body.authentications.account.token.token
    })

    analytics.management.accountSummaries.list({}, (error, accountSummaries) => {
      if (error) {
        response.json({
          proceed: false,
          errors: [{type: '400', message: error.toString()}]
        })
        return
      }

      const analyticsEntries = []
      const enumNames = {}

      accountSummaries.items.forEach(item => {
        item.webProperties.forEach(properties => {
          analyticsEntries.push({
            name: properties.name,
            id: properties.id
          })
        })
      })

      if (!analyticsEntries.length) {
        response.json({proceed: true})
        return
      }

      // Populate install schema with user's analytic IDs
      analyticsEntries.forEach(entry => {
        enumNames[entry.id] = `${entry.name} (${entry.id})`
      })

      Object.assign(install.schema.properties.id, {
        enum: analyticsEntries.map(entry => entry.id),
        enumNames
      })

      install.options.id = analyticsEntries[0].id

      // Include link to Google Analytics Dashboard.
      // TODO: Is it possible to link to a particular web property?
      install.links = [{
        title: 'Google Analytics',
        description: 'Visit Google Analytics to track your site\'s activity.',
        href: 'https://analytics.google.com'
      }]

      response.json({install})
    })
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
