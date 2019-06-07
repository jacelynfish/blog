let SYNC_TAG = 'jacelyn-blog-sync';
let STORE_NAME = 'bg_sync';

function requestNotification() {
  if (IS_OFFLINE && 'Notification' in window) {
    Notification.requestPermission().then(res => {
      if (Notification.permission !== res) {
        Notification.permission = res;
      }
      console.log(res);
    });
  }
}

function subscribePush(registration) {
  return registration.pushManager.getSubscription().then(sub => {
    if (sub) {
      return sub;
    } else {
      return registration.pushManager.subscribe({
        userVisibleOnly: true
      });
    }
  });
}

function displayNotification(registration, title, options) {
  if (Notification.permission == 'granted') {
    registration.showNotification(title, options);
  }
}

function openStore(storeName) {
  return new Promise(function (resolve, reject) {
    if (!('indexedDB' in window)) {
      reject("don't support indexedDB");
    }
    var request = indexedDB.open('JACELYN1995', 1);
    request.onerror = function (e) {
      reject(e);
    };
    request.onsuccess = function (e) {
      resolve(e.target.result);
    };
    request.onupgradeneeded = function (e) {
      var db = e.srcElement.result;
      if (e.oldVersion === 0) {
        if (!db.objectStoreNames.contains(storeName)) {
          var store = db.createObjectStore(storeName, {
            keyPath: 'tag'
          });
          store.createIndex(storeName + 'Index', 'tag', {
            unique: false
          });
        }
      }
    };
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then(function (registration) {
      let headerValue = new Date().valueOf();

      if (registration.navigationPreload &&
        typeof registration.navigationPreload.setHeaderValue == 'function')
        return registration.navigationPreload.setHeaderValue(headerValue);
    })
    .catch(function (err) {
      console.log(err);
    });

  let titleMatch = /^\/(.+\/)*([^\/]+)\/?$/g.exec(location.pathname);
  let sync_tag = `${SYNC_TAG}-${titleMatch ? titleMatch[2] : 'home'}`;
  navigator.serviceWorker.ready.then(registration => {
    requestNotification();
    subscribePush(registration)
      .then(sub => {
        // handle saving subscription with the server
        console.log(sub);
      })
      .catch(_ => {});
    Promise.all([openStore(STORE_NAME), registration]).then(
      ([db, registration]) => {
        var transaction = db.transaction(STORE_NAME, 'readwrite');
        var store = transaction.objectStore(STORE_NAME);
        var item = {
          tag: sync_tag,
          url: location.pathname + location.search
        };
        store.put(item);

        if (IS_OFFLINE) {
          registration.sync
            .register(sync_tag)
            .then(() => registration.sync.getTags())
            .catch(err => {
              console.error('error while registring background sync', SYNC_TAG);
            });
        }

        navigator.serviceWorker.addEventListener('message', e => {
          let {
            type
          } = e.data;
          if (type == 'FORCE_RELOAD') {
            if (IS_OFFLINE && e.data.url == location.pathname) {
              location.reload();
            }
          }
        });
      }
    );
  });
}
