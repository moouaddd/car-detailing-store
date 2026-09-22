import {useEffect, useRef, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import {gsap} from 'gsap';
import type {ProductFragment, ProductVariantFragment} from 'storefrontapi.generated';

type GalleryImage = NonNullable<ProductVariantFragment['image']>;

/**
 * Product gallery: a large primary image with a thumbnail strip. Every image
 * comes from data already fetched by the PRODUCT_QUERY (variant images +
 * per-option first-selectable-variant images) — no new Storefront API calls.
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();

  // A manual thumbnail pick only overrides the display until the variant
  // itself changes, then the gallery follows the newly selected variant again.
  useEffect(() => {
    setActiveId(null);
  }, [selectedVariant?.id]);

  const activeImage =
    images.find((image) => image.id === activeId) ??
    selectedVariant?.image ??
    images[0] ??
    null;

  useEffect(() => {
    if (!mainRef.current || reducedMotion) return;
    gsap.fromTo(
      mainRef.current,
      {opacity: 0.35},
      {opacity: 1, duration: 0.45, ease: 'power2.out'},
    );
  }, [activeImage?.id, reducedMotion]);

  if (!activeImage) {
    return (
      <div className="product-gallery">
        <div className="product-gallery-main product-gallery-main--empty" />
      </div>
    );
  }

  return (
    <div className="product-gallery">
      <div className="product-gallery-main" ref={mainRef}>
        <Image
          alt={activeImage.altText || product.title}
          aspectRatio="1/1"
          data={activeImage}
          key={activeImage.id}
          loading="eager"
          sizes="(min-width: 64em) 44vw, 100vw"
        />
      </div>
      {images.length > 1 && (
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
              aria-selected={image.id === activeImage.id}
              aria-label={image.altText || product.title}
              className={`product-gallery-thumb${
                image.id === activeImage.id ? ' is-active' : ''
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
