/**
 * High-Performance, Modular Enterprise Router for Cloudflare Workers & Node HTTP
 * Supports route parameters (:id), prefix nesting, middleware pipelines, and regex matching.
 */

export class Router {
  constructor(basePath = '') {
    this.basePath = basePath.replace(/\/+$/, '');
    this.routes = [];
    this.middlewares = [];
  }

  use(...args) {
    if (args.length === 1 && typeof args[0] === 'function') {
      this.middlewares.push(args[0]);
    } else if (args.length === 2 && typeof args[0] === 'string' && args[1] instanceof Router) {
      const [prefix, subRouter] = args;
      const normalizedPrefix = prefix.replace(/\/+$/, '');
      for (const route of subRouter.routes) {
        this.routes.push({
          ...route,
          path: `${normalizedPrefix}${route.path}` || '/',
          regex: this._pathToRegex(`${normalizedPrefix}${route.path}` || '/'),
          paramNames: this._extractParamNames(`${normalizedPrefix}${route.path}` || '/'),
          handlers: [...subRouter.middlewares, ...route.handlers]
        });
      }
    } else if (args.length >= 2 && typeof args[0] === 'string') {
      const prefix = args[0];
      const handlers = args.slice(1);
      for (const h of handlers) {
        if (h instanceof Router) {
          this.use(prefix, h);
        } else if (typeof h === 'function') {
          this.routes.push({
            method: 'ALL',
            path: `${prefix}/*`,
            regex: new RegExp(`^${prefix}(?:/.*)?$`),
            paramNames: [],
            handlers: [h]
          });
        }
      }
    }
    return this;
  }

  get(path, ...handlers) {
    return this.add('GET', path, handlers);
  }

  post(path, ...handlers) {
    return this.add('POST', path, handlers);
  }

  put(path, ...handlers) {
    return this.add('PUT', path, handlers);
  }

  patch(path, ...handlers) {
    return this.add('PATCH', path, handlers);
  }

  delete(path, ...handlers) {
    return this.add('DELETE', path, handlers);
  }

  options(path, ...handlers) {
    return this.add('OPTIONS', path, handlers);
  }

  all(path, ...handlers) {
    return this.add('ALL', path, handlers);
  }

  add(method, path, handlers) {
    const fullPath = `${this.basePath}${path}` || '/';
    this.routes.push({
      method: method.toUpperCase(),
      path: fullPath,
      regex: this._pathToRegex(fullPath),
      paramNames: this._extractParamNames(fullPath),
      handlers
    });
    return this;
  }

  _extractParamNames(path) {
    const paramNames = [];
    const matches = path.match(/:([a-zA-Z0-9_]+)/g);
    if (matches) {
      for (const match of matches) {
        paramNames.push(match.slice(1));
      }
    }
    return paramNames;
  }

  _pathToRegex(path) {
    // Escape special regex characters except / and :
    let regexStr = path
      .replace(/\/+$/, '')
      .replace(/([.+*?^=!:${}()|\[\]\/\\])/g, (match) => {
        if (match === '/' || match === ':') return match;
        return `\\${match}`;
      });

    // Replace :param with capture group ([^/]+)
    regexStr = regexStr.replace(/:([a-zA-Z0-9_]+)/g, '([^/]+)');

    // Replace wildcard *
    regexStr = regexStr.replace(/\\\*/g, '(.*)');

    return new RegExp(`^${regexStr || '/'}$`);
  }

  async handle(request, env, context = {}) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // Prepare context
    const ctx = context || {};
    ctx.params = ctx.params || {};

    // Execute global middlewares first
    for (const mw of this.middlewares) {
      const res = await mw(request, env, ctx);
      if (res instanceof Response) {
        return res;
      }
    }

    // Match route
    for (const route of this.routes) {
      const methodMatches = route.method === 'ALL' || 
                            route.method === method || 
                            (method === 'HEAD' && route.method === 'GET');

      if (!methodMatches) {
        continue;
      }

      const match = pathname.match(route.regex);
      if (match) {
        // Extract route params
        const params = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
        }
        ctx.params = { ...ctx.params, ...params };
        request.params = ctx.params;

        // Run handler pipeline
        for (const handler of route.handlers) {
          const res = await handler(request, env, ctx);
          if (res instanceof Response) {
            return res;
          }
          if (res && res.error instanceof Response) {
            return res.error;
          }
        }
      }
    }

    return null; // Not matched
  }
}
