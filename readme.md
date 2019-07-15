
* Simple file queue for fetching sleep data from [Fitbit Web Api](https://dev.fitbit.com/build/reference/web-api)

production:

 * rename `env.template` to `.env` and customise configuration
 * run `install.js` as sudo

development:

 * rename `env.development.template` to `.env` and customise configuration
 * `npm start` to spin up the proxy server and the queue worker in development mode

test:

 * rename `env.development.template` to `.env` and customise configuration
 * `npm run test`


WIP, thus not licensed yet
