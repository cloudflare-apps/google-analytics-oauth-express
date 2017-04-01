const credentials = require('./credentials.json')

const google = require('googleapis')
const {OAuth2} = google.auth
const oauth2Client = new OAuth2(
  credentials.clientID,
  credentials.clientSecret,
  credentials.redirectURI
)

google.options({auth: oauth2Client})
const analytics = google.analytics('v3')

const express = require('express')
const bodyParser = require('body-parser')
const app = express()

app.use(bodyParser.json())
app.set('port', (process.env.PORT || 5000))

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

    response.json({install})
  })
})

app.listen(app.get('port'), () => {
  console.log('Cloudflare Google Analytics is running on port', app.get('port'))
})
