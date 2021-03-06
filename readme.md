
# Surveysystem FITBIT modules

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

Example of setting up the Express proxy in `lighttpd.conf`

```perl
# Given that APP_PROXY_PORT is set to 9009 for production..

server.modules += (
    "mod_proxy"
)

$SERVER["socket"] == ":80" {
    # ...
    $HTTP["url"] =~ "^/modules" {
        proxy.server = ( "" => ( ( "host" => "127.0.0.1", "port" => "9009" ) ) )
        proxy.header = ( "upgrade" => "enable" )
    # ...
}
```

## Custom HTML Theme.

Copy `./views/default` folder (containing templates and assets) to your chosen theme name and set `APP_VIEWS_DIR=<PATH_TO_MY_THEME>` in your local `.env`

---

WIP, thus not licensed yet
