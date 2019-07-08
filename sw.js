let fileList = {
  main: ['/', '/css/main.css?v=6.4.2', '/swReg.js', '/offline/'],
  runtime: [/^\/js\/.+\.js/gi],
  static: [/^\/images\/.+\.(jpeg|jpg|png|webp|gif|svg)/gi, /\.(ttf|woff2)$/],
  vendor: [
    '/lib/font-awesome/css/font-awesome.min.css?v=4.6.2',
    '/lib/font-awesome/fonts/fontawesome-webfont.woff2?v=4.7.0',
    '/lib/jquery/index.js?v=2.1.3',
    '/lib/velocity/velocity.min.js?v=1.2.1',
    '/lib/velocity/velocity.ui.min.js?v=1.2.1'
  ]
};
const CACHE_NAME = 'jacelyn1995_0708_2';

const HOST_WHITELIST = ['cdnjs.cloudflare.com', 'resource.jacelyn.fish'];
const DIRECT_LIST = ['jacelynfish.disqus.com', 'cdn.viglink.com', 'cdn.jsdelivr.net'];

let STORE_NAME = 'bg_sync';

function openIndexDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open('JACELYN1995', 1);
    request.onerror = function (e) {
      reject(e);
    };
    request.onsuccess = function (e) {
      resolve(e.target.result);
    };
  });
}

self.addEventListener('notificationclose', (e) => {
  let notification = e.notification
  notification.close()
})

self.addEventListener('notificationclick', (e) => {
  let notification = e.notification
  let {
    url
  } = notification.data

  clients.openWindow(url)
  notification.close()
})

self.addEventListener('sync', e => {
  console.log(e.tag)
  if (/^jacelyn-blog-sync/.test(e.tag)) {
    e.waitUntil(
      openIndexDB()
      .then(db => {
        var transaction = db.transaction(STORE_NAME, 'readonly');
        var store = transaction.objectStore(STORE_NAME);

        var urlRequest = store.get(e.tag);

        return new Promise((resolve, reject) => {
          urlRequest.onsuccess = function (e) {
            resolve(e.target.result);
          };
          urlRequest.onerror = function (err) {
            reject(err);
          };
        });
      })
      .then(async ({
        url
      }) => {
        let fetched = fetch(url);
        let res = await fetched;
        let clients = await self.clients.matchAll();
        clients.some(client => {
          let clientUrl = new URL(client.url);
          let isSyncClient = clientUrl.pathname + clientUrl.search == url;
          if (isSyncClient)
            client.postMessage({
              type: 'FORCE_RELOAD',
              url
            });
          return isSyncClient;
        });
        return saveCache(url, res);
      })
    );
  }
});
self.addEventListener('install', e => {
  e.waitUntil(
    caches
    .open(CACHE_NAME)
    .then(cache =>
      cache.addAll([
        ...fileList.main,
        ...fileList.vendor,
        '/js/src/utils.js?v=6.4.2',
        '/js/src/motion.js?v=6.4.2',
        '/js/src/bootstrap.js?v=6.4.2'
      ])
    )
    .then(self.skipWaiting())
    .catch(err => console.log(err))
  );
});

function saveCache(req, res) {
  return caches.open(CACHE_NAME).then(cache => {
    if (res.ok) cache.put(req, res);
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method != 'GET') return;
  let url = new URL(e.request.url);

  let isLocal = url.host == self.location.host;
  if (DIRECT_LIST.indexOf(url.host) != -1) return;

  let isNavigate =
    e.request.mode == 'navigate' || e.request.destination == 'document';

  let cached = caches.match(e.request);
  let fetchClone = fetch(
    e.request.clone(),
    isLocal ? {} : {
      mode: 'cors',
      credentials: 'omit'
    }
  );
  // if it's navigate page, use preload resources
  let fetched =
    isLocal && isNavigate && e.preloadResponse ?
    e.preloadResponse.catch(_ => fetchClone) :
    fetchClone;
  let path = url.pathname + url.search;

  // cache, falling back to network
  if (
    HOST_WHITELIST.indexOf(url.host) != -1 ||
    (isLocal && fileList.vendor.indexOf(path) != -1) ||
    fileList.static.some(pat => path.match(pat) != null)
  ) {
    e.respondWith(
      caches.match(e.request).then(function (_res) {
        return (
          _res ||
          fetched.then(fetchRes => {
            e.waitUntil(saveCache(e.request, fetchRes.clone()));
            return fetchRes;
          }).catch(_ => {})
        );
      })
    );
  } else if (
    isLocal &&
    (isNavigate ||
      fileList.main.indexOf(path) != -1 ||
      fileList.runtime.some(pat => path.match(pat) != null))
  ) {
    // stale-while-revalidating
    // https://developers.google.com/web/fundamentals/instant-and-offline/offline-cookbook/#stale-while-revalidate

    let useCached = new Promise((resolve, reject) => {
      if (isNavigate) {
        setTimeout(() => {
          reject();
        }, 5000);
      } else {
        resolve(cached);
      }
    });

    e.respondWith(
      Promise.race([fetched.catch(_ => cached), useCached])
      .then(_res => _res || fetched)
      .catch(_ => {
        if (isNavigate) return caches.match('/offline/');
      })
    );

    let fetchedCopy = fetched.then(_res => _res.clone());

    // only cache the modified ones
    e.waitUntil(
      Promise.all([fetchedCopy, caches.match(e.request)])
      .then(([_resp, _cresp]) => {
        let fModified = _resp.headers.get('last-modified');
        let cModified = _cresp && _cresp.headers.get('last-modified');
        if (isNavigate || !fModified || fModified != cModified) {
          return saveCache(e.request, _resp);
        }
      })
      .catch(_ => {})
    );
  } else {
    e.respondWith(fetched.catch(_ => {}));
  }
});

self.addEventListener('activate', e => {
  let whiteList = [CACHE_NAME];
  e.waitUntil(
    (async function () {
      let keys = await caches.keys();
      await Promise.all(
        keys.map(name => {
          if (whiteList.indexOf(name) === -1) return caches.delete(name);
        })
      );
      await self.clients.claim();
      await self.registration.navigationPreload.enable();
    })()
  );
});
