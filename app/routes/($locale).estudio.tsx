import type {Route} from './+types/estudio';
import {Link, useLoaderData} from 'react-router';
import {Suspense, lazy, useCallback, useEffect, useState} from 'react';
import {Money} from '@shopify/hydrogen';
import {
  STUDIO_PRODUCTS,
  type StudioProduct,
} from '~/components/studio/studioProducts';
import type {StudioPhase} from '~/components/studio/StudioScene';

const StudioScene = lazy(() =>
  import('~/components/studio/StudioScene').then((mod) => ({
    default: mod.StudioScene,
  })),
);

/** Shopify handle of the product the "Wind Shield PRO" demo sells. */
const WIND_SHIELD_HANDLE = 'alzara-ceramic-shampoo';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Estudio 3D | AutoCare Express'},
    {
      name: 'description',
      content:
        'Elige un producto AutoCare Express y mira en 3D cómo limpia y protege un coche.',
    },
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  const {product} = await context.storefront.query(STUDIO_PRODUCT_QUERY, {
    variables: {handle: WIND_SHIELD_HANDLE},
  });
  return {shopProduct: product};
}

export default function Studio() {
  const {shopProduct} = useLoaderData<typeof loader>();
  const [product, setProduct] = useState<StudioProduct>(STUDIO_PRODUCTS[0]);
  const [runId, setRunId] = useState(0);
  const [resetId, setResetId] = useState(0);
  const [rain, setRain] = useState(false);
  const [phase, setPhase] = useState<StudioPhase>({status: 'idle', step: 0});
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // WebGL only exists in the browser; mount the scene after hydration.
  useEffect(() => {
    setMounted(true);
    setReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  const applying = phase.status === 'applying';

  const handlePhase = useCallback((next: StudioPhase) => setPhase(next), []);

  // Picking a product applies it straight away.
  const selectProduct = (next: StudioProduct) => {
    if (applying) return;
    setProduct(next);
    setRain(false);
    setPhase({status: 'applying', step: 0});
    setRunId((id) => id + 1);
  };

  const apply = () => {
    if (applying) return;
    if (product.effect === 'glass') setRain(false);
    setRunId((id) => id + 1);
  };

  const reset = () => {
    setRain(false);
    setResetId((id) => id + 1);
  };

  return (
    <div className="studio">
      <header className="studio-intro">
        <span className="studio-eyebrow">Estudio 3D</span>
        <h1 className="studio-title">Pruébalo antes de comprarlo.</h1>
        <p className="studio-lede">
          Elige un producto, aplícalo sobre el coche y mira el resultado en
          tiempo real. Gira la vista para verlo desde cualquier ángulo.
        </p>
      </header>

      <section className="studio-stage" aria-label="Coche en 3D">
        <div className="studio-viewport">
          {mounted && (
            <Suspense fallback={<div className="studio-canvas" />}>
              <StudioScene
                product={product}
                runId={runId}
                resetId={resetId}
                rain={rain}
                reducedMotion={reducedMotion}
                onPhase={handlePhase}
              />
            </Suspense>
          )}
          <span className="studio-hint">
            Arrastra para girar · Rueda para acercar
          </span>
        </div>

        <div className="studio-panel" role="group" aria-label="Productos">
          <span className="studio-panel-label">
            1 · Pulsa un producto para aplicarlo
          </span>
          <div className="studio-products" role="radiogroup">
            {STUDIO_PRODUCTS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === product.id}
                disabled={applying && item.id !== product.id}
                className={`studio-product${
                  item.id === product.id ? ' is-active' : ''
                }`}
                style={{'--studio-tone': item.tone} as React.CSSProperties}
                onClick={() => selectProduct(item)}
              >
                <span className="studio-product-swatch" aria-hidden="true" />
                <span className="studio-product-text">
                  <span className="studio-product-name">{item.name}</span>
                  <span className="studio-product-zone">{item.zone}</span>
                </span>
                <span
                  className={`studio-product-badge${
                    item.available ? ' is-available' : ''
                  }`}
                >
                  {item.available ? 'Disponible' : 'Próximamente'}
                </span>
              </button>
            ))}
          </div>

          <span className="studio-panel-label">2 · Aplícalo</span>
          <p className="studio-tagline">{product.tagline}</p>
          <ol className="studio-steps">
            {product.steps.map((step, index) => {
              const state =
                phase.status === 'done' || index < phase.step
                  ? 'is-done'
                  : phase.status === 'applying' && index === phase.step
                    ? 'is-current'
                    : '';
              return (
                <li key={step} className={`studio-step ${state}`}>
                  <span className="studio-step-index">{index + 1}</span>
                  {step}
                </li>
              );
            })}
          </ol>

          <div className="studio-actions">
            <button
              type="button"
              className="studio-apply"
              onClick={apply}
              disabled={applying}
            >
              {applying
                ? 'Aplicando…'
                : phase.status === 'done'
                  ? 'Aplicar otra vez'
                  : `Aplicar ${product.name}`}
            </button>
            <div className="studio-secondary">
              <button type="button" onClick={reset} disabled={applying}>
                Ensuciar de nuevo
              </button>
              <button
                type="button"
                aria-pressed={rain}
                onClick={() => setRain((value) => !value)}
                className={rain ? 'is-on' : ''}
              >
                {rain ? 'Parar lluvia' : 'Hacer llover'}
              </button>
            </div>
          </div>

          {phase.status === 'done' && (
            <div className="studio-result" aria-live="polite">
              <span className="studio-panel-label">Resultado</span>
              <p className="studio-result-title">{product.resultTitle}</p>
              <p className="studio-result-text">{product.resultText}</p>
              {product.available && shopProduct ? (
                <Link
                  to={`/products/${shopProduct.handle}`}
                  className="studio-buy"
                  prefetch="intent"
                >
                  <span>Ver {shopProduct.title.split(' – ')[0]}</span>
                  <Money data={shopProduct.priceRange.minVariantPrice} />
                </Link>
              ) : (
                <span className="studio-soon-note">
                  Disponible próximamente en la tienda.
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <p className="studio-credit">
        Modelo 3D del coche:{' '}
        <a
          href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept"
          target="_blank"
          rel="noopener noreferrer"
        >
          “Car Concept”
        </a>{' '}
        de Eric Chadwick / Darmstadt Graphics Group, licencia{' '}
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC BY 4.0
        </a>
        , adaptado por AutoCare Express. Simulación con fines ilustrativos.
      </p>
    </div>
  );
}

const STUDIO_PRODUCT_QUERY = `#graphql
  query StudioProduct(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      id
      title
      handle
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
    }
  }
` as const;
