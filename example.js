
var ip_filter = require('./');
var redis = require('redis');
var koa = require('koa');
var app = new Koa();

// apply rate limit

app.use(ip_filter({
  db: redis.createClient()
}));

// response middleware

app.use(function (ctx, next){
  ctx.body = 'Hello!';
});

app.listen(4000);
console.log('listening on port 4000');
