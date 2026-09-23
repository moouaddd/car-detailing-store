/**
 * Products you can try in the 3D studio. `effect` decides what the product
 * does to the car; `available` products link to their Shopify page, the rest
 * are shown as "Próximamente" but can still be tried.
 */
export type StudioEffect = 'glass' | 'wash' | 'coat';

export type StudioProduct = {
  id: string;
  name: string;
  zone: string;
  tagline: string;
  steps: [string, string, string];
  resultTitle: string;
  resultText: string;
  effect: StudioEffect;
  /** Spray/foam colour and bottle accent. */
  tone: string;
  available: boolean;
};

export const STUDIO_PRODUCTS: StudioProduct[] = [
  {
    id: 'wind-shield-pro',
    name: 'Wind Shield PRO',
    zone: 'Parabrisas',
    tagline: 'Elimina la película grasienta y repele el agua al instante.',
    steps: [
      'Pulveriza sobre el cristal',
      'Frota con microfibra',
      'Cristal impecable',
    ],
    resultTitle: 'Cristal impecable, sin marcas',
    resultText:
      'Ni grasa ni marcas de agua: visión perfectamente clara. Pulsa «Hacer llover» para ver cómo el agua resbala en el parabrisas tratado y se queda en las ventanillas sin tratar.',
    effect: 'glass',
    tone: '#6fb6ff',
    available: true,
  },
  {
    id: 'ceramic-shampoo',
    name: 'Ceramic Shampoo',
    zone: 'Carrocería',
    tagline: 'Espuma densa pH neutro que arrastra la suciedad sin rayar.',
    steps: ['Aplica la espuma', 'Deja actuar', 'Aclara'],
    resultTitle: 'Carrocería limpia, sin marcas',
    resultText:
      'La espuma encapsula el polvo y la suciedad de carretera y se aclara sin frotar de más.',
    effect: 'wash',
    tone: '#f2f2f2',
    available: false,
  },
  {
    id: 'ceramic-coating',
    name: 'Ceramic Coating 9H',
    zone: 'Pintura',
    tagline:
      'Capa cerámica que multiplica el brillo y la profundidad del color.',
    steps: ['Aplica por paneles', 'Nivela', 'Curado'],
    resultTitle: 'Efecto espejo',
    resultText:
      'Reflejos más nítidos y un color más profundo. Funciona mejor sobre la carrocería ya lavada.',
    effect: 'coat',
    tone: '#c9a24b',
    available: false,
  },
];
