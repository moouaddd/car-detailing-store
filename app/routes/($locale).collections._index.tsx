import {redirect} from 'react-router';
import type {Route} from './+types/collections._index';

/**
 * The store presents one curated catalog instead of a list of Shopify
 * collections, so /collections always lands on it (keeping any locale prefix).
 */
export function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/\/collections\/?$/, '/collections/all');
  return redirect(url.pathname + url.search);
}
