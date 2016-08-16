
# koa-ip-filter

 IP blacklist middleware for koa 2 (Only koa 2 supported)

## Installation

```js
$ npm install git+ssh://git@github.com/ahauser31/koa-ip-filter.git
```

## Example

```js
var ipFilter = require('koa-ip-filter');
var redis = require('redis');
var koa = require('koa');
var app = new Koa();

// apply ip filter

app.use(ipFilter({
  db: redis.createClient(),
  id: function (context) {
    return context.ip;
  }
}));

// response middleware

app.use(function (ctx, next){
  ctx.body = 'Hello!';
});

app.listen(3000);
console.log('listening on port 3000');
```

## Options
 
 - `db` redis connection instance
 - `duration` blacklist duration in milliseconds [86400000 (=24 hours)]
 - `errorMsgPermanent` text in body of error response for permanent blacklisting [`'Permanently blacklisted'`]
 - `errorMsgRetry` text in body of error response for limited blacklisting (limited for `duration`) [`'Blacklisted, retry in '`]
 - `appendRetryTime` append retry time to error body text [true]
 - `errorMsgDB` message of thrown error object in case of DB errors [`'ERROR_DATABASE_ERROR'`]
 - `customDBError` thrown error message for DB failure is `errorMsgDB` instead of redis error message (hide true cause in production) [true]
 - `retryHeader` custom header for non-permanent blacklisting [`'X-Retry-After'`]
 - `setHeader` append custom header to response for non-permanent blacklisting [true]
 - `filterBlacklist` error message thrown downstream indicating that client should be non-permanently blacklisted for `duration` [`'IP_FILTER_BLACKLIST'`]
 - `filterBlacklistPermanent` error message thrown downstream indicating that client should be permanently blacklisted [`'IP_FILTER_BLACKLIST_PERMANENT'`]
 - `throw` throw for client ip found on blacklist  [true]

## Responses

  Example 200 with header fields:

```
HTTP/1.1 200 OK
X-Powered-By: koa
Content-Type: text/plain; charset=utf-8
Content-Length: 6
Date: Wed, 13 Nov 2013 21:22:13 GMT
Connection: keep-alive

Hello!
```

  Example 401 response:

```
HTTP/1.1 401 Unauthorized
X-Powered-By: koa
Content-Type: text/plain; charset=utf-8
Content-Length: 39
X-Retry-After: 60000
Date: Wed, 13 Nov 2013 21:21:48 GMT
Connection: keep-alive

Blacklisted, retry in 1 minute
```

## License

  MIT
