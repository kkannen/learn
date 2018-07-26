import { merge } from 'rxjs/observable/merge';
import { empty } from 'rxjs/observable/empty';
import {
  tap,
  filter,
  map,
  ignoreElements,
  switchMap,
  catchError
} from 'rxjs/operators';
import { ofType } from 'redux-observable';
import store from 'store';
import uuid from 'uuid/v4';

import { types, onlineStatusChange, isOnlineSelector } from './';
import postUpdate$ from '../../templates/Challenges/utils/postUpdate$';

const key = 'fcc-failed-updates';

function delay(time = 0, fn) {
  return setTimeout(fn, time);
}

function failedUpdateEpic(action$, { getState }) {
  const storeUpdates = action$.pipe(
    ofType(types.updateFailed),
    tap(({ payload }) => {
      const failures = store.get(key) || [];
      payload.id = uuid();
      store.set(key, [...failures, payload]);
    }),
    map(() => onlineStatusChange(false))
  );

  const flushUpdates = action$.pipe(
    ofType(types.fetchUserComplete, types.updateComplete),
    filter(() => store.get(key)),
    filter(() => isOnlineSelector(getState())),
    tap(() => {
      const failures = store.get(key) || [];
      let delayTime = 0;
      const batch = failures.map(update => {
        delayTime += 300;
        // we stagger the updates here so we don't hammer the server
        return delay(delayTime, () =>
          postUpdate$(update)
            .pipe(
              switchMap(response => {
                if (response && response.message) {
                  // the request completed successfully
                  const failures = store.get(key) || [];
                  const newFailures = failures.filter(x => x.id !== update.id);
                  store.set(key, newFailures);
                }
                return empty();
              }),
              catchError(() => empty())
            )
            .toPromise()
        );
      });
      Promise.all(batch)
        .then(() => console.info('progress updates processed where possible'))
        .catch(err =>
          console.warn('unable to process progress updates', err.message)
        );
    }),
    ignoreElements()
  );

  return merge(storeUpdates, flushUpdates);
}

export default failedUpdateEpic;
