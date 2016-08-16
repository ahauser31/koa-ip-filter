
var request = require('supertest');
var should = require('should');
var redis = require('redis');
var Koa = require('koa');

var ip_filter = require('..');

var db = redis.createClient();

describe('ip filtering middleware', function() {

  before(function(done) {
    db.keys('ipFilter:*', function(err, rows) {
      rows.forEach( (element) => {
        db.del(element, () => {});  
      });
    });

    done();
  });

  describe('blacklist', function() {
    var app;
    var yielded;

    beforeEach(function(done) {
      app = new Koa();

      app.use(ip_filter({
        db: db,
        errorMsgRetry: 'Blacklisted, non-permanent',
        errorMsgPermanent: 'Permanently blacklisted',
        appendRetryTime: false,
        throw: false,
        ip: function(ctx) {return '127.0.0.1'}
      }));
  
      yielded = false;
      
      app.use(function (ctx, next) {
        yielded = true;
        ctx.body = 'Not blocked!';
      });
      
      done();
    });
    
    it('responds with 401 when IP is non-permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', Date.now() + 86400000, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(401);
            res.text.should.equal('Blacklisted, non-permanent');
          })
          .end(done);
      });
    });
    
    it('responds with 403 when IP is permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', -1, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(403);
            res.text.should.equal('Permanently blacklisted');
          })
          .end(done);
      });
    });

    it('should not yield downstream if IP is blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', -1, (err, tReply) => {
        if (err) throw('Database error');

        request(app.listen())
          .get('/')
          .expect((res) => {
            res.status.should.equal(403);
            yielded.should.equal(false);
          })
          .end(done);
      });
    });
    
    it('should yield downstream if IP is not blacklisted', function(done) {
      db.del('ipFilter:127.0.0.1', (err, tReply) => {
        if (err) throw('Database error');

        request(app.listen())
          .get('/')
          .expect((res) => {
            res.status.should.equal(200);
            res.text.should.equal('Not blocked!');
            yielded.should.equal(true);
          })
          .end(done);
      });
    });
    
  });
  
  describe('app puts ip on blacklist, permanent and wait for duration', function() {
    var app;
    var block;

    before(function(done) {
      app = new Koa();
      block = 0;

      app.use(ip_filter({
        db: db,
        duration: 1000,
        errorMsgRetry: 'Blacklisted, non-permanent',
        errorMsgPermanent: 'Permanently blacklisted',
        appendRetryTime: false,
        filterBlacklist: 'IP_FILTER_BLACKLIST',
        filterBlacklistPermanent: 'IP_FILTER_BLACKLIST_PERMANENT',
        retryHeader: 'X-Retry-After',
        throw: false,
        ip: function(ctx) {return '127.0.0.1'}
      }));
      
      app.use( (ctx, next) => {
        if (block === 0) return next();
        if (block < 0) ctx.throw(500, 'IP_FILTER_BLACKLIST_PERMANENT');
        if (block > 0) ctx.throw(500, 'IP_FILTER_BLACKLIST');
      });
      
      app.use(function (ctx, next) {
        ctx.body = 'Not blocked!';
      });
      
      db.del('ipFilter:127.0.0.1', (err, tReply) => {
        if (err) throw('Database error');
        done();
      });
    });
  
    it('should yield downstream', function(done) {
      block = 0;
      request(app.listen())
        .get('/')
        .expect((res) => {
          res.status.should.equal(200);
          res.text.should.equal('Not blocked!');
        })
        .end(done);
    });
    
    it('should cause the app to be blacklisted non-permanently, as an error is thrown downstream', function(done) {
      block = -1;
      request(app.listen())
        .get('/')
        .expect(403, 'Permanently blacklisted')
        .end(done);
    });
    
    it('should wait 1500ms and check if client still blacklisted (longer than non-permablock duration)', function(done) {
      block = 0;
      setTimeout( () => {
        request(app.listen())
          .get('/')
          .expect(403, 'Permanently blacklisted')
          .end(done);
      }, 1500);
    });
    
  });
  
  describe('app puts ip on blacklist, non-permanent and wait for duration', function() {
    var app;
    var block;

    before(function(done) {
      app = new Koa();
      block = 0;

      app.use(ip_filter({
        db: db,
        duration: 1000,
        errorMsgRetry: 'Blacklisted, non-permanent',
        errorMsgPermanent: 'Permanently blacklisted',
        appendRetryTime: false,
        filterBlacklist: 'IP_FILTER_BLACKLIST',
        filterBlacklistPermanent: 'IP_FILTER_BLACKLIST_PERMANENT',
        retryHeader: 'X-Retry-After',
        throw: false,
        ip: function(ctx) {return '127.0.0.1'}
      }));
      
      app.use( (ctx, next) => {
        if (block === 0) return next();
        if (block < 0) ctx.throw(500, 'IP_FILTER_BLACKLIST_PERMANENT');
        if (block > 0) ctx.throw(500, 'IP_FILTER_BLACKLIST');
      });
      
      app.use(function (ctx, next) {
        ctx.body = 'Not blocked!';
      });
      
      db.del('ipFilter:127.0.0.1', (err, tReply) => {
        if (err) throw('Database error');
        done();
      });
    });
    
    it('should yield downstream', function(done) {
      block = 0;
      request(app.listen())
        .get('/')
        .expect((res) => {
          res.status.should.equal(200);
          res.text.should.equal('Not blocked!');
        })
        .end(done);
    });
    
    it('should cause the app to be blacklisted non-permanently, as an error is thrown downstream', function(done) {
      block = 1;
      request(app.listen())
        .get('/')
        .expect(401, 'Blacklisted, non-permanent')
        .end(done);
    });
    
    it('should wait 500ms and check if client still blacklisted (shorter than blacklist duration)', function(done) {
      block = 0;
      setTimeout( () => {
        request(app.listen())
          .get('/')
          .expect(function(res) {
            res.status.should.equal(401);
            res.text.should.equal('Blacklisted, non-permanent');
            res.headers.should.containEql('x-retry-after');
            res.headers['x-retry-after'].should.be.below(1000);
          })
          .end(done);
      }, 500);
    });
    
    it('should wait another 1000ms and check if client unblocked again (longer than blacklist duration)', function(done) {
      block = 0;
      setTimeout( () => {
        request(app.listen())
          .get('/')
          .expect(200, 'Not blocked!')
          .end(done);
      }, 1000);
    });

  });
  
  describe('blacklist with throw', function() {
    var app;

    beforeEach(function(done) {
      app = new Koa();

      app.use(function (ctx, next) {
        return next().catch(err => {
          ctx.body = err.message;
          if (typeof err.headers !== 'undefined') ctx.set(err.headers);
        });
      });
      
      app.use(ip_filter({
        db: db,
        errorMsgRetry: 'Blacklisted, non-permanent',
        errorMsgPermanent: 'Permanently blacklisted',
        appendRetryTime: false,
        throw: true,
        ip: function(ctx) {return '127.0.0.1'}
      }));
  
      
      app.use(function (ctx, next) {
        ctx.body = 'Not blocked';
      });
      
      done();
    });

    it('responds with 401 when IP is non-permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', Date.now() + 86400000, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(401);
            res.text.should.equal('Blacklisted, non-permanent');
          })
          .end(done);
      });
    });
    
    it('responds with 403 when IP is permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', -1, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(403);
            res.text.should.equal('Permanently blacklisted');
          })
          .end(done);
      });
    });
    
  });

  
  describe('ip', function (done) {
    it('should allow specifying a custom `ip` function', function (done) {
      db.set('ipFilter:bar', -1, (err, tReply) => {
        var app = new Koa();
    
        app.use(ip_filter({
          db: db,
          throw: false,
          errorMsgPermanent: 'Permanently blacklisted',
          ip: function (ctx) {
            return ctx.request.header.foo;
          }
        }));
        
        app.use( (ctx, next) => {
          ctx.body = 'Not blacklisted!';
        });
    
        request(app.listen())
          .get('/')
          .set('foo', 'bar')
          .expect(function(res) {
            res.text.should.equal('Permanently blacklisted');
          })
          .end(done);
      });
    });
    
    it('should not block if `ip` returns `false`', function (done) {
      db.set('ipFilter:bar', -1, (err, tReply) => {
        var app = new Koa();
    
        app.use(ip_filter({
          db: db,
          throw: false,
          errorMsgPermanent: 'Permanently blacklisted',
          ip: function (ctx) {
            return false;
          }
        }));
        
        app.use( (ctx, next) => {
          ctx.body = 'Not blacklisted!';
        });
    
        request(app.listen())
          .get('/')
          .set('foo', 'bar')
          .expect(function(res) {
            res.text.should.equal('Not blacklisted!');
          })
          .end(done);
      });
    });
  
    it('should block using the `ip` value', function (done) {
      var app = new Koa();
  
      app.use(ip_filter({
        db: db,
        throw: false,
        ip: function (ctx) {
          return ctx.request.header.foo;
        }
      }));
  
      app.use(function (ctx, next) {
        ctx.body = ctx.request.header.foo;
      });
  
      request(app.listen())
        .get('/')
        .set('foo', 'bar')
        .expect(200, 'bar')
        .end(function() {
          request(app.listen())
            .get('/')
            .set('foo', 'biz')
            .expect(200, 'biz')
            .end(done);
        });
    });
  });
  
  describe('custom error message in body', function() {
    var app;

    beforeEach(function(done) {
      app = new Koa();

      app.use(ip_filter({
        db: db,
        errorMsgRetry: 'Boo!',
        errorMsgPermanent: 'Hoo!',
        appendRetryTime: false,
        throw: false,
        ip: function(ctx) {return '127.0.0.1'}
      }));
  
      
      app.use(function (ctx, next) {
        ctx.body = 'Not blocked!';
      });
      
      done();
    });
    
    it('body text of reply is "Boo!" when IP is non-permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', Date.now() + 86400000, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(401);
            res.text.should.equal('Boo!');
          })
          .end(done);
      });
    });
    
    it('body text of reply is "Hoo!" when IP is permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', -1, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(403);
            res.text.should.equal('Hoo!');
          })
          .end(done);
      });
    });
    
  });
  
  describe('reply header', function() {
    var app;

    beforeEach(function(done) {
      app = new Koa();

      app.use(ip_filter({
        db: db,
        retryHeader: 'Foo',
        setHeader: true,
        appendRetryTime: false,
        throw: false,
        ip: function(ctx) {return '127.0.0.1'}
      }));
  
      
      app.use(function (ctx, next) {
        ctx.body = 'Not blocked!';
      });
      
      done();
    });
    
    it('headers of reply contains custom retry header "Foo" when IP is non-permanently blacklisted', function(done) {
      db.set('ipFilter:127.0.0.1', Date.now() + 86400000, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(401);
            res.headers.should.containEql('foo');
          })
          .end(done);
      });
    });
    
    it('retry header contains less than "duration" milliseconds', function(done) {
      db.set('ipFilter:127.0.0.1', Date.now() + 1000, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(401);
            res.headers.should.containEql('foo');
            res.headers['foo'].should.be.belowOrEqual(1000);
          })
          .end(done);
      });
    });
    
  });
  
  describe('append retry time', function() {
    var app;

    beforeEach(function(done) {
      app = new Koa();

      app.use(ip_filter({
        db: db,
        setHeader: true,
        appendRetryTime: true,
        throw: false,
        ip: function(ctx) {return '127.0.0.1'}
      }));
  
      
      app.use(function (ctx, next) {
        ctx.body = 'Not blocked!';
      });
      
      done();
    });
    
    
    it('body of reply contains retry time', function(done) {
      db.set('ipFilter:127.0.0.1', Date.now() + 500, (err, tReply) => {
        if (err) throw('Database error');
        
        request(app.listen())
          .get('/')
          .expect( (res) => {
            res.status.should.equal(401);
            res.headers.should.containEql('x-retry-after');
            res.text.should.endWith(res.headers['x-retry-after'] + ' ms');
          })
          .end(done);
      });
    });
    
  });


  //describe('errorMsg', function (done) {
  //  it('should allow using a custom error body message using the `errorMsg` value', function (done) {
  //    var app = new Koa();
  //
  //    app.use(ratelimit({
  //      db: db,
  //      max: 1,
  //      errorMsg: 'Exceeded limit, retry in '
  //    }));
  //
  //    request(app.listen())
  //      .get('/')
  //      .expect(429)
  //      .expect(function(res) {
  //        res.text.should.startWith('Exceeded limit, retry in');
  //        res.text.should.not.startWith('Rate limit exceeded, retry in');
  //      })
  //      .end(done);
  //  });
  //});
  //
  //describe('custom headers', function() {
  //  it('should allow specifying a custom header names', function(done) {
  //    var app = new Koa();
  //
  //    app.use(ratelimit({
  //      db: db,
  //      max: 1,
  //      headers: {
  //        remaining: 'Rate-Limit-Remaining',
  //        reset: 'Rate-Limit-Reset',
  //        total: 'Rate-Limit-Total'
  //      }
  //    }));
  //
  //    request(app.listen())
  //      .get('/')
  //      .set('foo', 'bar')
  //      .expect(function(res) {
  //        res.headers.should.containEql('rate-limit-remaining', 'rate-limit-reset', 'rate-limit-total');
  //        res.headers.should.not.containEql('x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset');
  //      })
  //      .end(done);
  //  });
  //});
});
