import {Suspense, lazy, useEffect, useRef, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import {gsap} from 'gsap';
import type {ProductFragment, ProductVariantFragment} from 'storefrontapi.generated';

type GalleryImage = NonNullable<ProductVariantFragment['image']>;
type GalleryModel = {id: string; url: string; alt: string | null; preview: string | null};

const ProductModelViewer = lazy(() =>
  import('./ProductModelViewer').then((mod) => ({
    default: mod.ProductModelViewer,
  })),
);

/**
 * Product gallery: a large primary image with a thumbnail strip. Every image
 * comes from data already fetched by the PRODUCT_QUERY (variant images +
 * per-option first-selectable-variant images) — no new Storefront API calls.
 * A 3D model uploaded to the product's media in Shopify is shown as an extra,
 * rotatable gallery item (and as the main view when there are no photos).
 * Picking a thumbnail only changes which image is shown large (local UI
 * state); it never touches variant selection, so it can't affect the cart.
 */
export function ProductImage({
  product,
  selectedVariant,
}: {
  product: ProductFragment;
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
}) {
  const images = getGalleryImages(product, selectedVariant);
  const model = getGalleryModel(product);
  const [activeId, setActiveId] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();
  // WebGL only exists in the browser; render the 3D viewer after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A manual thumbnail pick only overrides the display until the variant
  // itself changes, then the gallery follows the newly selected variant again.
  useEffect(() => {
    setActiveId(null);
  }, [selectedVariant?.id]);

  const showModel =
    !!model && (activeId === model.id || (!activeId && images.length === 0));
  const activeImage = showModel
    ? null
    : (images.find((image) => image.id === activeId) ??
      selectedVariant?.image ??
      images[0] ??
      null);
  const activeKey = showModel ? model.id : activeImage?.id;

  useEffect(() => {
    if (!mainRef.current || reducedMotion) return;
    gsap.fromTo(
      mainRef.current,
      {opacity: 0.35},
      {opacity: 1, duration: 0.45, ease: 'power2.out'},
    );
  }, [activeKey, reducedMotion]);

  if (!activeImage && !showModel) {
    return (
      <div className="product-gallery">
        <div
          className="product-gallery-main product-gallery-main--empty"
          role="img"
          aria-label={product.title}
        >
          <div className="hero3d-fallback-bottle" />
          <span className="product-gallery-empty-note">
            Fotografía próximamente
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="product-gallery">
      <div
        className={`product-gallery-main${
          showModel ? ' product-gallery-main--model' : ''
        }`}
        ref={mainRef}
      >
        {showModel ? (
          <div
            className="product-gallery-model"
            role="img"
            aria-label={model.alt || product.title}
          >
            {mounted && (
              <Suspense fallback={null}>
                <ProductModelViewer
                  url={model.url}
                  reducedMotion={reducedMotion}
                />
              </Suspense>
            )}
            <span className="product-gallery-model-hint">
              Arrastra para girar
            </span>
          </div>
        ) : (
          activeImage && (
            <Image
              alt={activeImage.altText || product.title}
              aspectRatio="1/1"
              data={activeImage}
              key={activeImage.id}
              loading="eager"
              sizes="(min-width: 64em) 44vw, 100vw"
            />
          )
        )}
      </div>
      {images.length + (model ? 1 : 0) > 1 && (
        <div
          className="product-gallery-thumbs"
          role="tablist"
          aria-label="Product images"
        >
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              role="tab"
              aria-selected={image.id === activeKey}
              aria-label={image.altText || product.title}
              className={`product-gallery-thumb${
                image.id === activeKey ? ' is-active' : ''
              }`}
              onClick={() => setActiveId(image.id ?? null)}
            >
              <Image
                alt={image.altText || product.title}
                aspectRatio="1/1"
                data={image}
                loading="lazy"
                sizes="88px"
              />
            </button>
          ))}
          {model && (
            <button
              type="button"
              role="tab"
              aria-selected={showModel}
              aria-label={`${product.title} 3D`}
              className={`product-gallery-thumb product-gallery-thumb--model${
                showModel ? ' is-active' : ''
              }`}
              onClick={() => setActiveId(model.id)}
            >
              {model.preview && (
                <img src={model.preview} alt="" loading="lazy" />
              )}
              <span className="product-gallery-thumb-badge">3D</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function getGalleryImages(
  product: ProductFragment,
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'],
): GalleryImage[] {
  const seen = new Map<string, GalleryImage>();
  const add = (image?: GalleryImage | null) => {
    if (image?.id && !seen.has(image.id)) seen.set(image.id, image);
  };

  add(selectedVariant?.image);
  for (const option of product.options ?? []) {
    for (const value of option.optionValues ?? []) {
      add(value.firstSelectableVariant?.image);
    }
  }
  for (const variant of product.adjacentVariants ?? []) {
    add(variant.image);
  }

  return Array.from(seen.values());
}

function getGalleryModel(product: ProductFragment): GalleryModel | null {
  for (const media of product.media?.nodes ?? []) {
    if (media.__typename !== 'Model3d') continue;
    const glb = media.sources.find((source) => source.format === 'glb');
    if (!glb) continue;
    return {
      id: media.id,
      url: glb.url,
      alt: media.alt ?? null,
      preview: media.previewImage?.url ?? null,
    };
  }
  return null;
}

function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const handleChange = (event: MediaQueryListEvent) =>
      setReduced(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);
  return reduced;
}
