import StyleDictionary from 'style-dictionary';

// ── Helper: convert DTCG color object to CSS ──
function colorToCSS(color) {
  if (typeof color === 'string') return color;
  if (!color || typeof color !== 'object') return String(color);
  if (color.hex) {
    if (color.alpha != null && color.alpha < 1) {
      const hex = color.hex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${color.alpha})`;
    }
    return color.hex;
  }
  if (color.components) {
    const [r, g, b] = color.components.map((c) => Math.round(c * 255));
    const a = color.alpha ?? 1;
    return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  }
  return String(color);
}

// ── Helper: convert DTCG dimension object to CSS ──
function dimensionToCSS(dim) {
  if (typeof dim === 'string') return dim;
  if (typeof dim === 'number') return `${dim}px`;
  if (dim && typeof dim === 'object' && dim.value != null) {
    return `${dim.value}${dim.unit || 'px'}`;
  }
  return String(dim);
}

// ── 1. Color transform ──────────────────────────────────
StyleDictionary.registerTransform({
  name: 'color/css',
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'color',
  transform: (token) => {
    return colorToCSS(token.$value);
  }
});

// ── 2. Dimension transform ──────────────────────────────
StyleDictionary.registerTransform({
  name: 'dimension/css',
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'dimension',
  transform: (token) => {
    return dimensionToCSS(token.$value);
  }
});

// ── 3. Number transform ──────────────────────────────
StyleDictionary.registerTransform({
  name: 'number/css',
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'number',
  transform: (token) => {
    return String(token.$value);
  }
});

// ── 4. Shadow transform ──────────────────────────────────
StyleDictionary.registerTransform({
  name: 'shadow/css',
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'shadow',
  transform: (token) => {
    // Use original.$value because SD v4's css transformGroup stringifies
    // the shadow array before custom transforms run
    const raw = token.original?.$value ?? token.$value;
    const shadows = Array.isArray(raw) ? raw : [raw];
    return shadows.map((s) => {
      if (typeof s === 'string') return s;
      const color = colorToCSS(s.color);
      const offsetX = dimensionToCSS(s.offsetX ?? 0);
      const offsetY = dimensionToCSS(s.offsetY ?? 0);
      const blur = dimensionToCSS(s.blur ?? 0);
      const spread = dimensionToCSS(s.spread ?? 0);
      const inset = s.inset ? 'inset ' : '';
      return `${inset}${offsetX} ${offsetY} ${blur} ${spread} ${color}`;
    }).join(', ');
  }
});

// ── 5. Gradient transform ──────────────────────────────────
StyleDictionary.registerTransform({
  name: 'gradient/css',
  type: 'value',
  transitive: true,
  filter: (token) => token.$type === 'gradient',
  transform: (token) => {
    const stops = token.$value;
    if (!Array.isArray(stops)) return token.$value;
    const angle = token.$extensions?.['com.figma']?.angle ?? 180;
    const cssStops = stops.map((stop) => {
      const cssColor = colorToCSS(stop.color);
      if (!cssColor) return null;
      const pos = stop.position != null ? ` ${(stop.position * 100).toFixed(0)}%` : '';
      return `${cssColor}${pos}`;
    }).filter(Boolean);
    return `linear-gradient(${angle}deg, ${cssStops.join(', ')})`;
  }
});

// ── 6. Typography expanded format ──────────────────────────
StyleDictionary.registerFormat({
  name: 'css/variables-expanded',
  format: ({ dictionary }) => {
    const lines = [];
    dictionary.allTokens.forEach((token) => {
      const name = token.name;
      const desc = token.$description || token.description;

      const origVal = token.original?.$value ?? token.$value;
      const isTypography = token.$type === 'typography'
        && typeof origVal === 'object'
        && !Array.isArray(origVal);

      if (isTypography) {
        const val = origVal;
        if (desc) lines.push(`  /** ${desc} */`);
        if (val.fontFamily) lines.push(`  --${name}-font-family: ${val.fontFamily};`);
        if (val.fontWeight != null) lines.push(`  --${name}-font-weight: ${val.fontWeight};`);
        if (val.fontSize != null) {
          const fs = typeof val.fontSize === 'object' ? `${val.fontSize.value}${val.fontSize.unit}` : val.fontSize;
          lines.push(`  --${name}-font-size: ${fs};`);
        }
        if (val.lineHeight != null) lines.push(`  --${name}-line-height: ${val.lineHeight};`);
        if (val.letterSpacing != null) {
          const ls = typeof val.letterSpacing === 'object' ? `${val.letterSpacing.value}${val.letterSpacing.unit}` : val.letterSpacing;
          lines.push(`  --${name}-letter-spacing: ${ls};`);
        }
      } else {
        if (desc) lines.push(`  /** ${desc} */`);
        // All non-typography values should already be strings from transforms
        let val = token.$value ?? token.value;
        // Safety net: if somehow still an object, try to resolve
        if (typeof val === 'object' && val !== null) {
          if (val.hex) val = colorToCSS(val);
          else if (val.value != null && val.unit != null) val = dimensionToCSS(val);
          else val = JSON.stringify(val);
        }
        lines.push(`  --${name}: ${val};`);
      }
    });
    return `:root {\n${lines.join('\n')}\n}\n`;
  }
});

// ── 7. Build ───────────────────────────────────────────────
const sd = new StyleDictionary({
  source: ['unity.tokens.json'],
  log: { warnings: 'disabled', verbosity: 'default', errors: { brokenReferences: 'console' } },
  platforms: {
    css: {
      transformGroup: 'css',
      transforms: ['color/css', 'dimension/css', 'number/css', 'shadow/css', 'gradient/css'],
      buildPath: 'output/',
      files: [{ destination: 'tokens.css', format: 'css/variables-expanded', options: { outputReferences: true } }]
    }
  }
});

await sd.buildAllPlatforms();
console.log('\n✅ Build complete → output/tokens.css');
