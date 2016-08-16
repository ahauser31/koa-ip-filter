
/**
 * Module dependencies.
 */
var ms = require('ms');
var assert = require('assert');

/**
 * Expose `ip_filter()`.
 */

module.exports = ip_filter;

/**
 * Initialize ip filer middleware with the given `opts`:
 *
 * - `db` redis connection instance
 * - `duration` blacklist duration in milliseconds [24 hour]
 * - `errorMsgPermanent` text in body of error response for permanent blacklisting ['Permanently blacklisted']
 * - `errorMsgRetry` text in body of error response for limited blacklisting (limited for `duration`) ['Blacklisted, retry in ']
 * - `appendRetryTime` append retry time to error body text [true]
 * - `errorMsgDB` message of thrown error object in case of DB errors ['ERROR_DATABASE_ERROR']
 * - `customDBError` thrown error message for DB failure is `errorMsgDB` instead of redis error message (hide true cause in production) [true]
 * - `retryHeader` custom header for non-permanent blacklisting ['X-Retry-After']
 * - `setHeader` append custom header to response for non-permanent blacklisting [true]
 * - `filterBlacklist` error message thrown downstream indicating that client should be non-permanently blacklisted for `duration` ['IP_FILTER_BLACKLIST']
 * - `filterBlacklistPermanent` error message thrown downstream indicating that client should be permanently blacklisted ['IP_FILTER_BLACKLIST_PERMANENT']
 * - `throw` throw for client ip found on blacklist  [true]
 *
 * @param {Object} opts
 * @return {Function}
 * @api public
 */

function ip_filter(opts) {
  opts = opts || {};
  assert(opts.db, '.db required');
  opts.duration = opts.duration || 86400000;  // 24h
  opts.errorMsgPermanent = opts.errorMsgPermanent || 'Permanently blacklisted';
  opts.errorMsgRetry = opts.errorMsgRetry || 'Blacklisted, retry in ';
  opts.appendRetryTime = (typeof opts.appendRetryTime !== 'undefined') ? opts.appendRetryTime : true;
  opts.errorMsgDB = opts.errorMsgDB || 'ERROR_DATABASE_ERROR';
  opts.customDBError = (typeof opts.customDBError !== 'undefined') ? opts.customDBError : true;
  opts.retryHeader = opts.retryHeader || 'X-Retry-After';
  opts.setHeader = (typeof opts.setHeader !== 'undefined') ? opts.setHeader : true;
  
  opts.filterBlacklist = opts.filterBlacklist || 'IP_FILTER_BLACKLIST';
  opts.filterBlacklistPermanent = opts.filterBlacklistPermanent || 'IP_FILTER_BLACKLIST_PERMANENT';
  opts.throw = (typeof opts.throw !== 'undefined') ? opts.throw : false;

  return function (ctx, next){
    // Ignore request if no IP present
    var ip = opts.ip ? opts.ip(ctx) : ctx.ip;
    if (false === ip) return next();

    // initialize
    var entry = 'ipFilter:' + ip;

    // Check db if ip is on blacklist
    return new Promise( (resolve, reject) => {
      opts.db.get(entry, function (err, res) {
        if (err) return reject(opts.customDBError ? opts.errorMsgDB : err); // No need to write the reject handler, Koa throws anyway
        
        // Return time of ban or 0 for no ban (-1 == premanent)
        return resolve(res === null ? 0 : res);
      });
    }).then((res) => {
      if (res !== 0)
      {
        // Client on blacklist, return an error (no need to update DB, it will clean old blacklisting automatically after `duration`)
        error(res, false);
        return;
      } else {
        // Not on blacklist
        return next().catch( (err) => {
          // Caught a downstream error, check if it is an error indicating the client needs to be put on blacklist
          if (err.message === opts.filterBlacklist || err.message === opts.filterBlacklistPermanent ) {
            // Client to be blacklisted, return error and write entry into DB
            error(err.message === opts.filterBlacklistPermanent ? -1 : opts.duration, true);
            return;
          }
          else
          {
            // Re-throw error for upstream handlers
            ctx.throw(err);
            return;
          }
        });
      }
    });
    
    function error(res, writeDB)
    {
      // Save IP into DB
      if (writeDB)
      {
        var val = [entry, (res < 0 ? res : (Date.now() + res))];
        if (res >= 0) {
          val.push('PX');
          val.push(res);
        }
        val.push('NX');
        opts.db.set(val, (err, res) => {
          // Throw if value can't be written
          if (err) ctx.throw(500, opts.customDBError ? opts.errorMsgDB : err);
        });
      }
      
      // IP on blacklist
      if (res < 0)
      {
        // Permanent ban
        ctx.status = 403;
        ctx.body = opts.errorMsgPermanent;
        
        if (opts.log) opts.log(ctx, opts.errorMsgPermanent);
        
        if (opts.throw) ctx.throw(ctx.status, ctx.body);
        return; 
      }
      
      // Non-permanent ban, calculate time left to unban
      var retryTime = res - Date.now();
      var headers = {};
      headers[opts.retryHeader] = retryTime;
      if (opts.setHeader) ctx.set(headers);
      
      ctx.status = 401;
      ctx.body = opts.errorMsgRetry + (opts.appendRetryTime ? ms(retryTime, { long: true }) : '');
      
      if (opts.log) opts.log(ctx, opts.errorMsgRetry);
      
      if (opts.throw) ctx.throw(ctx.status, ctx.body, { headers: opts.setHeader ? headers : [] });
    }
    
  }
}
