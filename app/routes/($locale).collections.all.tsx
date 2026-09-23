import type {Route} from './+types/collections.all';
import {Link, useLoaderData} from 'react-router';
import {Suspense, lazy, useEffect, useState} from 'react';
import {Image, Money} from '@shopify/hydrogen';
import type {CollectionItemFragment} from 'storefrontapi.generated';
import {ProductItem} from '~/components/ProductItem';
import {ScrollFade, ScrollStagger} from '~/components/ScrollReveal';
import {useVariantUrl} from '~/lib/variants';

const ProductModelViewer = lazy(() =>
  import('~/components/ProductModelViewer').then((mod) => ({
    default: mod.ProductModelViewer,
  })),
);

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Catálogo | AutoCare Express'},
    {
      name: 'description',
      content:
        'Productos de detailing de alta gama de AutoCare Express: protección, lavado y acabado para coches que merecen más que un lavado.',
    },
  ];
};

/**
 * Products announced but not yet on sale. Edit this list to change the
 * "Próximamente" section — it is static content, not Shopify data.
 */
const COMING_SOON = [
  {
    category: 'Lavado',
    name: 'Ceramic Shampoo',
    description: 'Champú pH neutro con SiO₂ que limpia y refuerza la protección en cada lavado.',
    tone: 'gold',
  },
  {
    category: 'Protección cerámica',
    name: 'Ceramic Coating 9H',
    description: 'Recubrimiento cerámico profesional: brillo profundo y protección de larga duración.',
    tone: 'steel',
  },
  {
    category: 'Acabado',
    name: 'Quick Detailer Gloss',
    description: 'Brillo inmediato y tacto sedoso entre lavados, sin marcas ni residuos.',
    tone: 'amber',
  },
  {
    category: 'Interior',
    name: 'Interior Care',
    description: 'Limpieza y protección UV para cuero, plásticos y salpicadero con acabado mate.',
    tone: 'ivory',
  },
] as const;

export async function loader({context}: Route.LoaderArgs) {
  const {products} = await context.storefront.query(CATALOG_QUERY);
  return {products: products.nodes};
}

export default function Catalog() {
  const {products} = useLoaderData<typeof loader>();
  const [featured, ...rest] = products;

  return (
    <div className="catalog">
      <header className="catalog-intro">
        <span className="catalog-eyebrow">Catálogo AutoCare Express</span>
        <h1 className="catalog-title">
          Cuidado de alta gama,
          <br />
          pensado para durar.
        </h1>
        <p className="catalog-lede">
          Fórmulas de grado profesional para quien trata su coche como una
          pieza única. Empezamos por la visibilidad; lo siguiente ya está en
          camino.
        </p>
      </header>

      {featured && <FeaturedProduct product={featured} />}

      {rest.length > 0 && (
        <section className="catalog-section" aria-labelledby="catalog-more">
          <SectionHeading id="catalog-more" eyebrow="Disponible" title="Más productos" />
          <ScrollStagger className="catalog-grid">
            {rest.map((product) => (
              <ProductItem key={product.id} product={product} loading="lazy" />
            ))}
          </ScrollStagger>
        </section>
      )}

      <section className="catalog-section" aria-labelledby="catalog-soon">
        <SectionHeading
          id="catalog-soon"
          eyebrow="Próximamente"
          title="La colección completa"
          lede="Cada paso del detailing, con el mismo estándar. Estos son los próximos lanzamientos."
        />
        <ScrollStagger className="catalog-soon-grid">
          {COMING_SOON.map((item) => (
            <article key={item.name} className={`soon-card soon-card--${item.tone}`}>
              <div className="soon-card-visual" aria-hidden="true">
                <div className="soon-bottle" />
              </div>
              <div className="soon-card-body">
                <span className="soon-card-category">{item.category}</span>
                <h3 className="soon-card-name">{item.name}</h3>
                <p className="soon-card-text">{item.description}</p>
                <span className="soon-card-badge">Próximamente</span>
              </div>
            </article>
          ))}
        </ScrollStagger>
      </section>

      <ScrollFade>
        <section className="catalog-promise">
          <div>
            <span className="catalog-promise-value">Grado profesional</span>
            <span className="catalog-promise-label">Fórmulas usadas en taller</span>
          </div>
          <div>
            <span className="catalog-promise-value">Envío con seguimiento</span>
            <span className="catalog-promise-label">Desde el pedido hasta tu puerta</span>
          </div>
          <div>
            <span className="catalog-promise-value">Pago seguro</span>
            <span className="catalog-promise-label">Checkout de Shopify</span>
          </div>
        </section>
      </ScrollFade>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="catalog-section-heading">
      <span className="catalog-eyebrow">{eyebrow}</span>
      <h2 id={id} className="catalog-section-title">
        {title}
      </h2>
      {lede && <p className="catalog-section-lede">{lede}</p>}
    </div>
  );
}

function FeaturedProduct({product}: {product: CollectionItemFragment}) {
  const url = useVariantUrl(product.handle);
  const model = product.media.nodes.find(
    (media) => media.__typename === 'Model3d',
  );
  const modelUrl =
    model?.__typename === 'Model3d'
      ? model.sources.find((source) => source.format === 'glb')?.url
      : undefined;
  const image =
    product.featuredImage ?? product.media.nodes[0]?.previewImage ?? null;

  // WebGL only exists in the browser; mount the viewer after hydration.
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setMounted(true);
    setReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  return (
    <section className="catalog-featured" aria-labelledby="featured-title">
      <div className="catalog-featured-visual">
        <div className="catalog-featured-glow" aria-hidden="true" />
        {modelUrl ? (
          mounted && (
            <Suspense fallback={null}>
              <ProductModelViewer url={modelUrl} reducedMotion={reducedMotion} />
            </Suspense>
          )
        ) : (
          image && (
            <Image
              data={image}
              alt={image.altText || product.title}
              aspectRatio="1/1"
              sizes="(min-width: 64em) 50vw, 100vw"
              loading="eager"
            />
          )
        )}
        {modelUrl && <span className="catalog-featured-hint">Arrastra para girar</span>}
      </div>

      <div className="catalog-featured-info">
        <span className="catalog-featured-tag">Producto estrella</span>
        <h2 id="featured-title" className="catalog-featured-title">
          {product.title}
        </h2>
        {product.description && (
          <p className="catalog-featured-text">{truncate(product.description, 220)}</p>
        )}
        <div className="catalog-featured-price">
          <Money data={product.priceRange.minVariantPrice} />
        </div>
        <div className="catalog-featured-actions">
          <Link className="catalog-cta" to={url} prefetch="intent">
            Descubrir producto
            <span aria-hidden="true">&rarr;</span>
          </Link>
          <Link className="catalog-cta-ghost" to="/estudio" prefetch="intent">
            Verlo en acción en 3D
          </Link>
        </div>
      </div>
    </section>
  );
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, text.lastIndexOf(' ', max))}…`;
}

const COLLECTION_ITEM_FRAGMENT = `#graphql
  fragment MoneyCollectionItem on MoneyV2 {
    amount
    currencyCode
  }
  fragment CollectionItem on Product {
    id
    handle
    title
    description
    featuredImage {
      id
      altText
      url
      width
      height
    }
    media(first: 5) {
      nodes {
        __typename
        previewImage {
          id
          altText
          url
          width
          height
        }
        ... on Model3d {
          sources {
            url
            format
          }
        }
      }
    }
    priceRange {
      minVariantPrice {
        ...MoneyCollectionItem
      }
      maxVariantPrice {
        ...MoneyCollectionItem
      }
    }
  }
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/product
const CATALOG_QUERY = `#graphql
  query Catalog($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    products(first: 24, sortKey: BEST_SELLING) {
      nodes {
        ...CollectionItem
      }
    }
  }
  ${COLLECTION_ITEM_FRAGMENT}
` as const;
