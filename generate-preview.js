import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = join(__dirname, 'output', 'tokens.css');
const outPath = join(__dirname, 'output', 'preview.html');

// Parse tokens from CSS
const css = readFileSync(cssPath, 'utf-8');
const tokenRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
const tokens = [];
let m;
while ((m = tokenRegex.exec(css)) !== null) {
  tokens.push({ name: m[1], value: m[2].trim() });
}

const totalCount = tokens.length;

// ---------- helpers ----------

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isColor(v) {
  return /^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v);
}

function isGradient(v) {
  return /gradient\(/i.test(v);
}

function isShadow(v) {
  return /^\d+px\s+\d+px\s+\d+px/.test(v);
}

function isDimension(v) {
  return /^-?\d+(\.\d+)?(px|rem|em|%)$/.test(v);
}

function isNumber(v) {
  return /^-?\d+(\.\d+)?$/.test(v);
}

function luminance(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const r = parseInt(hex.substring(0,2),16)/255;
  const g = parseInt(hex.substring(2,4),16)/255;
  const b = parseInt(hex.substring(4,6),16)/255;
  const toL = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  return 0.2126*toL(r) + 0.7152*toL(g) + 0.0722*toL(b);
}

function textColorForBg(val) {
  if (/^#[0-9a-fA-F]{3,8}$/.test(val)) {
    return luminance(val) > 0.4 ? '#171717' : '#FFFFFF';
  }
  if (/^rgba?\(/.test(val)) {
    const nums = val.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      const hex = '#' + [0,1,2].map(i => Math.round(parseFloat(nums[i])).toString(16).padStart(2,'0')).join('');
      const alpha = nums.length >= 4 ? parseFloat(nums[3]) : 1;
      if (alpha < 0.3) return '#171717';
      return luminance(hex) > 0.4 ? '#171717' : '#FFFFFF';
    }
  }
  return '#171717';
}

function humanize(s) {
  return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ---------- categorize tokens ----------

const categories = {
  colorRamps: [],
  alphaColors: [],
  semanticColors: [],
  gradients: [],
  textStyles: [],
  typescale: [],
  shadows: [],
  spacing: [],
  borderRadius: [],
  borderWeights: [],
  borderShadows: [],
  iconSizes: [],
  brands: [],
  components: [],
  typographyVars: [],
  colorsOther: [],
};

const categorized = new Set();

for (const t of tokens) {
  const n = t.name;
  if (n.startsWith('colors-')) {
    if (/-alpha-\d+$/.test(n)) {
      categories.alphaColors.push(t);
    } else if (/\d+$/.test(n)) {
      categories.colorRamps.push(t);
    } else {
      categories.colorsOther.push(t);
    }
    categorized.add(n);
  } else if (n.startsWith('modes-')) {
    categories.semanticColors.push(t);
    categorized.add(n);
  } else if (n.startsWith('paint-styles-')) {
    categories.gradients.push(t);
    categorized.add(n);
  } else if (n.startsWith('text-styles-')) {
    categories.textStyles.push(t);
    categorized.add(n);
  } else if (n.startsWith('typescale-')) {
    categories.typescale.push(t);
    categorized.add(n);
  } else if (n.startsWith('effect-styles-shadow-')) {
    categories.shadows.push(t);
    categorized.add(n);
  } else if (n.startsWith('spacing-and-size-')) {
    categories.spacing.push(t);
    categorized.add(n);
  } else if (n.startsWith('border-and-radius-radius-')) {
    categories.borderRadius.push(t);
    categorized.add(n);
  } else if (n.startsWith('border-and-radius-border-weight-')) {
    categories.borderWeights.push(t);
    categorized.add(n);
  } else if (n.startsWith('border-and-radius-shadow-')) {
    categories.borderShadows.push(t);
    categorized.add(n);
  } else if (n.startsWith('icon-size-')) {
    categories.iconSizes.push(t);
    categorized.add(n);
  } else if (n.startsWith('brands-')) {
    categories.brands.push(t);
    categorized.add(n);
  } else if (n.startsWith('components-')) {
    categories.components.push(t);
    categorized.add(n);
  } else if (n.startsWith('typography-font-')) {
    categories.typographyVars.push(t);
    categorized.add(n);
  }
}

const miscTokens = tokens.filter(t => !categorized.has(t.name));

// ---------- Section renderers ----------

function groupColorRamps(arr) {
  const groups = new Map();
  for (const t of arr) {
    const parts = t.name.replace('colors-', '');
    const lastDash = parts.lastIndexOf('-');
    const hue = parts.substring(0, lastDash);
    const step = parts.substring(lastDash + 1);
    if (!groups.has(hue)) groups.set(hue, []);
    groups.get(hue).push({ ...t, step });
  }
  return groups;
}

function renderColorRamps() {
  const groups = groupColorRamps(categories.colorRamps);
  let html = '';
  for (const [hue, swatches] of groups) {
    html += `<div class="ramp-group"><h4>${escHtml(humanize(hue))}</h4><div class="ramp-row">`;
    for (const s of swatches) {
      const tc = textColorForBg(s.value);
      html += `<div class="swatch" style="background:var(--colors-${escHtml(hue)}-${escHtml(s.step)});color:${tc}">
        <span class="swatch-hex">${escHtml(s.value)}</span>
        <span class="swatch-step">${escHtml(s.step)}</span>
      </div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

function renderAlphaColors() {
  const groups = new Map();
  for (const t of categories.alphaColors) {
    const parts = t.name.replace('colors-', '');
    const idx = parts.indexOf('-alpha-');
    const hue = parts.substring(0, idx);
    if (!groups.has(hue)) groups.set(hue, []);
    groups.get(hue).push({ ...t, step: parts.substring(idx + 7) });
  }
  let html = '';
  for (const [hue, swatches] of groups) {
    html += `<div class="ramp-group"><h4>${escHtml(humanize(hue))}</h4><div class="ramp-row">`;
    for (const s of swatches) {
      html += `<div class="swatch alpha-swatch" style="--alpha-color:var(--${escHtml(s.name)})">
        <span class="swatch-hex" style="color:#171717">${escHtml(s.step)}</span>
        <span class="swatch-step" style="color:#171717">alpha</span>
      </div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

function renderColorsOther() {
  if (categories.colorsOther.length === 0) return '';
  let html = '<div class="token-grid">';
  for (const t of categories.colorsOther) {
    html += renderSemanticDot(t);
  }
  html += '</div>';
  return html;
}

function renderSemanticDot(t) {
  const val = t.value;
  let dotStyle = '';
  if (isColor(val)) dotStyle = `background:${escHtml(val)};`;
  else if (isGradient(val)) dotStyle = `background:${escHtml(val)};`;
  else dotStyle = `background:#E6E6E6;`;
  return `<div class="sem-row">
    <span class="sem-dot" style="${dotStyle}"></span>
    <span class="sem-label">${escHtml(humanize(t.name))}</span>
    <code class="sem-token">--${escHtml(t.name)}</code>
    <span class="sem-value">${escHtml(val)}</span>
  </div>`;
}

function renderSemanticColors() {
  const groups = new Map();
  for (const t of categories.semanticColors) {
    const rest = t.name.replace('modes-', '');
    const firstDash = rest.indexOf('-');
    const sub = firstDash > -1 ? rest.substring(0, firstDash) : rest;
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub).push(t);
  }
  let html = '';
  for (const [sub, items] of groups) {
    html += `<div class="sem-group"><h4>${escHtml(humanize(sub))}</h4><div class="token-grid">`;
    for (const t of items) {
      html += renderSemanticDot(t);
    }
    html += `</div></div>`;
  }
  return html;
}

function renderGradients() {
  let html = '<div class="gradient-grid">';
  for (const t of categories.gradients) {
    const label = t.name.replace('paint-styles-', '');
    html += `<div class="gradient-card" style="background:var(--${escHtml(t.name)})">
      <span class="gradient-name">${escHtml(humanize(label))}</span>
      <code class="gradient-token">--${escHtml(t.name)}</code>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderTextStyles() {
  const propNames = ['font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing'];
  const groups = new Map();
  for (const t of categories.textStyles) {
    const rest = t.name.replace('text-styles-', '');
    let styleName = rest;
    let prop = '';
    for (const p of propNames) {
      if (rest.endsWith('-' + p)) {
        styleName = rest.substring(0, rest.length - p.length - 1);
        prop = p;
        break;
      }
    }
    if (!groups.has(styleName)) groups.set(styleName, { tokens: [], props: {} });
    const g = groups.get(styleName);
    g.tokens.push(t);
    if (prop) g.props[prop] = t.value;
  }

  const catGroups = new Map();
  for (const [styleName, data] of groups) {
    const cat = styleName.split('-')[0];
    if (!catGroups.has(cat)) catGroups.set(cat, []);
    catGroups.get(cat).push({ styleName, ...data });
  }

  let html = '';
  for (const [cat, specs] of catGroups) {
    html += `<div class="type-category"><h4>${escHtml(humanize(cat))}</h4>`;
    for (const spec of specs) {
      // Use CSS variables for live rendering
      const varPrefix = `--text-styles-${spec.styleName}`;
      const ff = spec.props['font-family'] || 'Inter';
      const fw = spec.props['font-weight'] || '400';
      const fs = spec.props['font-size'] || '16px';
      const lh = spec.props['line-height'] || '1.5';
      const ls = spec.props['letter-spacing'] || '0px';
      html += `<div class="type-specimen">
        <div class="type-sample" style="font-family:var(${varPrefix}-font-family, '${escHtml(ff)}'),sans-serif;font-weight:var(${varPrefix}-font-weight, ${escHtml(fw)});font-size:var(${varPrefix}-font-size, ${escHtml(fs)});line-height:var(${varPrefix}-line-height, ${escHtml(lh)});letter-spacing:var(${varPrefix}-letter-spacing, ${escHtml(ls)})">
          ${escHtml(humanize(spec.styleName))}
        </div>
        <div class="type-meta">
          <span>${escHtml(ff)} ${escHtml(fw)}</span>
          <span>${escHtml(fs)} / ${escHtml(lh)}</span>
          <span>Tracking: ${escHtml(ls)}</span>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderTypescale() {
  const propNames = ['font-size', 'font-weight', 'line-height', 'font-family'];
  const groups = new Map();
  for (const t of categories.typescale) {
    const rest = t.name.replace('typescale-', '');
    let styleName = rest;
    let prop = '';
    for (const p of propNames) {
      if (rest.endsWith('-' + p)) {
        styleName = rest.substring(0, rest.length - p.length - 1);
        prop = p;
        break;
      }
    }
    if (!groups.has(styleName)) groups.set(styleName, { tokens: [], props: {} });
    const g = groups.get(styleName);
    g.tokens.push(t);
    if (prop) g.props[prop] = t.value;
  }

  const catGroups = new Map();
  for (const [styleName, data] of groups) {
    const cat = styleName.split('-')[0];
    if (!catGroups.has(cat)) catGroups.set(cat, []);
    catGroups.get(cat).push({ styleName, ...data });
  }

  let html = '';
  for (const [cat, specs] of catGroups) {
    html += `<div class="type-category"><h4>${escHtml(humanize(cat))}</h4>`;
    for (const spec of specs) {
      const ff = spec.props['font-family'] || 'Inter';
      const fw = spec.props['font-weight'] || '400';
      const fs = spec.props['font-size'] || '16px';
      const lh = spec.props['line-height'] || '1.5';
      html += `<div class="type-specimen">
        <div class="type-sample" style="font-family:'${escHtml(ff)}',sans-serif;font-weight:${escHtml(fw)};font-size:${escHtml(fs)};line-height:${escHtml(lh)}">
          ${escHtml(humanize(spec.styleName))}
        </div>
        <div class="type-meta">
          <span>${escHtml(ff)} ${escHtml(fw)}</span>
          <span>${escHtml(fs)} / ${escHtml(lh)}</span>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

function renderShadows() {
  let html = '<div class="shadow-grid">';
  for (const t of categories.shadows) {
    const label = t.name.replace('effect-styles-shadow-', '');
    html += `<div class="shadow-card" style="box-shadow:var(--${escHtml(t.name)})">
      <span class="shadow-label">${escHtml(label.toUpperCase())}</span>
      <code class="shadow-token">--${escHtml(t.name)}</code>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderSpacing() {
  const base = [];
  const semantic = [];
  for (const t of categories.spacing) {
    if (/spacing-and-size-spacing-\d+$/.test(t.name)) {
      base.push(t);
    } else {
      semantic.push(t);
    }
  }

  let html = '<h4>Base Spacing Scale</h4><div class="spacing-list">';
  base.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  for (const t of base) {
    const label = t.name.replace('spacing-and-size-spacing-', '');
    html += `<div class="spacing-row">
      <span class="spacing-label">${escHtml(label)}</span>
      <div class="spacing-bar" style="width:var(--${escHtml(t.name)});min-width:2px"></div>
      <span class="spacing-value">${escHtml(t.value)}</span>
    </div>`;
  }
  html += '</div>';

  if (semantic.length > 0) {
    const groups = new Map();
    for (const t of semantic) {
      const rest = t.name.replace('spacing-and-size-', '');
      const parts = rest.split('-');
      let groupName;
      if (parts[0] === 'spacing' && parts[1] === 'semantic') {
        groupName = parts.slice(0, 3).join('-');
      } else if (parts[0] === 'size') {
        groupName = 'size-' + parts[1];
      } else {
        groupName = parts[0];
      }
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(t);
    }

    for (const [groupName, items] of groups) {
      html += `<h4>${escHtml(humanize(groupName))}</h4><div class="spacing-list">`;
      for (const t of items) {
        const shortName = t.name.replace('spacing-and-size-', '');
        html += `<div class="spacing-row">
          <span class="spacing-label">${escHtml(shortName)}</span>
          <div class="spacing-bar" style="width:var(--${escHtml(t.name)});min-width:2px"></div>
          <span class="spacing-value">${escHtml(t.value)}</span>
        </div>`;
      }
      html += '</div>';
    }
  }
  return html;
}

function renderBorderRadius() {
  let html = '<div class="radius-grid">';
  for (const t of categories.borderRadius) {
    const label = t.name.replace('border-and-radius-radius-', '');
    html += `<div class="radius-card">
      <div class="radius-box" style="border-radius:var(--${escHtml(t.name)})"></div>
      <span class="radius-label">${escHtml(label)}</span>
      <span class="radius-value">${escHtml(t.value)}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderBorderWeights() {
  let html = '<div class="radius-grid">';
  for (const t of categories.borderWeights) {
    const label = t.name.replace('border-and-radius-border-weight-', '');
    html += `<div class="radius-card">
      <div class="border-box" style="border-width:var(--${escHtml(t.name)})"></div>
      <span class="radius-label">${escHtml(label)}</span>
      <span class="radius-value">${escHtml(t.value)}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderBorderShadows() {
  if (categories.borderShadows.length === 0) return '';
  let html = '<div class="token-grid">';
  for (const t of categories.borderShadows) {
    html += renderSemanticDot(t);
  }
  html += '</div>';
  return html;
}

function renderIconSizes() {
  let html = '<div class="icon-grid">';
  for (const t of categories.iconSizes) {
    const label = t.name.replace('icon-size-icon-', '');
    html += `<div class="icon-card">
      <div class="icon-box" style="width:var(--${escHtml(t.name)});height:var(--${escHtml(t.name)})"></div>
      <span class="icon-label">${escHtml(label)}</span>
      <span class="icon-value">${escHtml(t.value)}</span>
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderBrands() {
  const groups = new Map();
  for (const t of categories.brands) {
    const rest = t.name.replace('brands-', '');
    let groupName;
    if (rest.startsWith('feedback-')) {
      const parts = rest.split('-');
      groupName = parts[0] + '-' + parts[1];
    } else if (rest.startsWith('neutral-white-')) {
      groupName = 'neutral-white';
    } else {
      const parts = rest.split('-');
      groupName = parts[0];
    }
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(t);
  }

  let html = '';
  for (const [groupName, items] of groups) {
    html += `<div class="sem-group"><h4>${escHtml(humanize(groupName))}</h4><div class="token-grid">`;
    for (const t of items) {
      html += renderSemanticDot(t);
    }
    html += `</div></div>`;
  }
  return html;
}

function renderComponents() {
  // Group by top-level component name
  const groups = new Map();
  for (const t of categories.components) {
    const rest = t.name.replace('components-', '');
    const parts = rest.split('-');
    const topComp = parts[0];
    if (!groups.has(topComp)) groups.set(topComp, []);
    groups.get(topComp).push(t);
  }

  let html = '';
  for (const [comp, items] of groups) {
    html += `<div class="component-group" id="comp-${escHtml(comp)}">
      <h4>${escHtml(humanize(comp))} <span style="font-weight:400;color:#A3A3A3;font-size:13px">(${items.length})</span></h4>`;

    // Live demos using CSS custom properties
    if (comp === 'button') {
      html += renderButtonDemos();
    } else if (comp === 'badge') {
      html += renderBadgeDemos();
    } else if (comp === 'alert') {
      html += renderAlertDemos();
    } else if (comp === 'text' || comp === 'input') {
      html += renderInputDemos();
    }

    // Token grid in collapsible details
    html += `<details class="comp-details"><summary>Show all ${items.length} tokens</summary><div class="token-grid">`;
    for (const t of items) {
      html += renderSemanticDot(t);
    }
    html += `</div></details></div>`;
  }
  return html;
}

// =============================================
// Component demos using CSS custom properties
// These render HTML with CSS classes that reference
// var(--components-...) from tokens.css directly
// =============================================

function renderButtonDemos() {
  return `<div class="component-demo">
    <h5 style="margin:0 0 12px;font-size:13px;font-weight:600;color:#525252;text-transform:uppercase;letter-spacing:0.05em">Variants</h5>
    <div class="button-row">
      <button class="btn btn-primary">Primary</button>
      <button class="btn btn-secondary">Secondary</button>
      <button class="btn btn-destructive">Destructive</button>
      <button class="btn btn-success">Success</button>
      <button class="btn btn-ghost">Ghost</button>
      <button class="btn btn-disabled" disabled>Disabled</button>
    </div>
  </div>`;
}

function renderBadgeDemos() {
  return `<div class="component-demo">
    <div class="badge-row">
      <span class="badge badge-success">✓ Success</span>
      <span class="badge badge-error">✕ Error</span>
      <span class="badge badge-warning">⚠ Warning</span>
      <span class="badge badge-info">ℹ Info</span>
      <span class="badge badge-neutral">● Neutral</span>
      <span class="badge badge-accent">★ Accent</span>
    </div>
  </div>`;
}

function renderAlertDemos() {
  return `<div class="component-demo">
    <div class="alert alert-error">⛔ Error — Something went wrong. Please try again.</div>
    <div class="alert alert-warning">⚠️ Warning — This action cannot be undone.</div>
    <div class="alert alert-success">✅ Success — Your changes have been saved.</div>
    <div class="alert alert-info">ℹ️ Info — A new version is available.</div>
  </div>`;
}

function renderInputDemos() {
  return `<div class="component-demo">
    <div class="input-demo">
      <div>
        <label class="input-label">Default</label>
        <input class="input-field" type="text" placeholder="Placeholder text" style="width:100%;margin-top:4px">
      </div>
      <div>
        <label class="input-label">Filled</label>
        <input class="input-field" type="text" value="Entered value" style="width:100%;margin-top:4px">
      </div>
      <div>
        <label class="input-label">Error</label>
        <input class="input-field error" type="text" value="Invalid input" style="width:100%;margin-top:4px">
      </div>
    </div>
  </div>`;
}

function renderTypographyVars() {
  const groups = new Map();
  for (const t of categories.typographyVars) {
    const rest = t.name.replace('typography-font-', '');
    const firstDash = rest.indexOf('-');
    const sub = firstDash > -1 ? rest.substring(0, firstDash) : rest;
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub).push(t);
  }

  let html = '<table class="type-table"><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>';
  for (const [sub, items] of groups) {
    html += `<tr class="type-table-header"><td colspan="2">${escHtml(humanize(sub))}</td></tr>`;
    for (const t of items) {
      html += `<tr><td><code>--${escHtml(t.name)}</code></td><td>${escHtml(t.value)}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  return html;
}

function renderMisc() {
  if (miscTokens.length === 0) return '';
  let html = '<div class="token-grid">';
  for (const t of miscTokens) {
    html += renderSemanticDot(t);
  }
  html += '</div>';
  return html;
}

// ---------- View 2: All Tokens ----------

function renderAllTokenRow(t) {
  const val = t.value;
  let preview = '';

  if (isColor(val)) {
    preview = `<span class="at-swatch" style="background:${escHtml(val)}"></span>`;
  } else if (isGradient(val)) {
    preview = `<span class="at-swatch" style="background:${escHtml(val)}"></span>`;
  } else if (isShadow(val)) {
    preview = `<span class="at-shadow-preview" style="box-shadow:${escHtml(val)}"></span>`;
  } else if (isDimension(val)) {
    const num = parseFloat(val);
    const w = Math.min(Math.max(num, 2), 200);
    preview = `<span class="at-dim-bar" style="width:${w}px"></span>`;
  } else if (isNumber(val)) {
    preview = `<span class="at-number">${escHtml(val)}</span>`;
  } else {
    preview = `<span class="at-text">${escHtml(val.length > 40 ? val.substring(0, 37) + '...' : val)}</span>`;
  }

  const cat = t.name.split('-')[0];

  return `<div class="at-row" data-cat="${escHtml(cat)}" data-name="${escHtml(t.name.toLowerCase())}" data-value="${escHtml(val.toLowerCase())}">
    <span class="at-preview">${preview}</span>
    <code class="at-token">--${escHtml(t.name)}</code>
    <span class="at-val">${escHtml(val)}</span>
  </div>`;
}

function renderAllTokens() {
  const groups = new Map();
  for (const t of tokens) {
    const cat = t.name.split('-')[0];
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(t);
  }

  let html = '';
  for (const [cat, items] of groups) {
    html += `<div class="at-group" data-group-cat="${escHtml(cat)}">
      <div class="at-group-header">${escHtml(humanize(cat))} <span class="at-count">(${items.length})</span></div>`;
    for (const t of items) {
      html += renderAllTokenRow(t);
    }
    html += `</div>`;
  }
  return html;
}

const allCats = [...new Set(tokens.map(t => t.name.split('-')[0]))].sort();

// ---------- sidebar nav ----------

const sections = [
  { id: 'color-ramps', label: 'Color Ramps', count: categories.colorRamps.length },
  { id: 'alpha-colors', label: 'Alpha Colors', count: categories.alphaColors.length },
  { id: 'colors-other', label: 'Other Colors', count: categories.colorsOther.length, hide: categories.colorsOther.length === 0 },
  { id: 'semantic-colors', label: 'Semantic Colors', count: categories.semanticColors.length },
  { id: 'gradients', label: 'Gradients', count: categories.gradients.length },
  { id: 'typography', label: 'Typography', count: categories.textStyles.length },
  { id: 'typescale', label: 'Typescale', count: categories.typescale.length },
  { id: 'shadows', label: 'Shadows', count: categories.shadows.length },
  { id: 'spacing', label: 'Spacing', count: categories.spacing.length },
  { id: 'border-radius', label: 'Border Radius', count: categories.borderRadius.length },
  { id: 'border-weights', label: 'Border Weights', count: categories.borderWeights.length },
  { id: 'border-shadows', label: 'Shadow Dimensions', count: categories.borderShadows.length, hide: categories.borderShadows.length === 0 },
  { id: 'icon-sizes', label: 'Icon Sizes', count: categories.iconSizes.length },
  { id: 'brands', label: 'Brands & Feedback', count: categories.brands.length },
  { id: 'components', label: 'Component Tokens', count: categories.components.length },
  { id: 'typography-vars', label: 'Typography Variables', count: categories.typographyVars.length },
  { id: 'miscellaneous', label: 'Miscellaneous', count: miscTokens.length, hide: miscTokens.length === 0 },
];

const sidebarHtml = sections.filter(s => !s.hide).map(s =>
  `<a href="#${s.id}" class="nav-link">${escHtml(s.label)} <span class="nav-count">${s.count}</span></a>`
).join('\n');

// ---------- Full HTML ----------

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Unity Design System - Token Preview</title>
<link rel="stylesheet" href="tokens.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: #FAFAFA; color: #171717; -webkit-font-smoothing: antialiased; }

/* tabs */
.tab-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; display: flex; align-items: center; gap: 0;
  background: #FFFFFF; border-bottom: 1px solid #E6E6E6; height: 52px; padding: 0 24px; }
.tab-bar .logo { font-weight: 700; font-size: 15px; color: #2E4DE5; margin-right: 32px; white-space: nowrap; }
.tab-bar .token-count { font-size: 12px; color: #737373; margin-left: auto; }
.tab-btn { padding: 14px 20px; font-size: 14px; font-weight: 500; color: #737373; background: none;
  border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; font-family: inherit; }
.tab-btn:hover { color: #171717; }
.tab-btn.active { color: #2E4DE5; border-bottom-color: #2E4DE5; }

/* sidebar */
.sidebar { position: fixed; top: 52px; left: 0; bottom: 0; width: 220px; background: #FFFFFF;
  border-right: 1px solid #E6E6E6; overflow-y: auto; padding: 16px 0; z-index: 100; }
.nav-link { display: flex; justify-content: space-between; align-items: center; padding: 7px 20px;
  font-size: 13px; color: #525252; text-decoration: none; transition: all 0.12s; }
.nav-link:hover { background: #F5F5F5; color: #171717; }
.nav-count { font-size: 11px; color: #A3A3A3; }

/* main content */
.main-ds { margin-top: 52px; margin-left: 220px; padding: 40px 48px 80px; }
.main-at { margin-top: 52px; padding: 24px 48px 80px; }

.hero { margin-bottom: 48px; }
.hero h1 { font-size: 42px; font-weight: 800; letter-spacing: -0.02em; color: #171717; }
.hero p { font-size: 16px; color: #737373; margin-top: 8px; }

.section { margin-bottom: 56px; }
.section > h3 { font-size: 20px; font-weight: 700; margin-bottom: 20px; padding-bottom: 8px;
  border-bottom: 1px solid #E6E6E6; color: #171717; }

/* color ramps */
.ramp-group { margin-bottom: 20px; }
.ramp-group h4 { font-size: 13px; font-weight: 600; color: #525252; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
.ramp-row { display: flex; gap: 2px; flex-wrap: wrap; }
.swatch { width: 72px; height: 72px; border-radius: 6px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; font-size: 10px; position: relative; }
.swatch-hex { font-size: 9px; font-weight: 500; }
.swatch-step { font-size: 10px; font-weight: 600; margin-top: 2px; }
.alpha-swatch { background: repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 12px 12px;
  position: relative; overflow: hidden; }
.alpha-swatch::after { content: ''; position: absolute; inset: 0; background: var(--alpha-color); }
.alpha-swatch .swatch-hex, .alpha-swatch .swatch-step { position: relative; z-index: 1; }

/* semantic dots */
.token-grid { display: flex; flex-direction: column; gap: 2px; }
.sem-row { display: grid; grid-template-columns: 16px 1fr 1fr auto; gap: 12px; align-items: center;
  padding: 6px 12px; border-radius: 4px; font-size: 13px; }
.sem-row:hover { background: #F5F5F5; }
.sem-dot { width: 16px; height: 16px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.08); flex-shrink: 0; }
.sem-label { font-weight: 500; color: #171717; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sem-token { font-size: 11px; color: #737373; font-family: 'SF Mono', 'Fira Code', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sem-value { font-size: 11px; color: #A3A3A3; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.sem-group { margin-bottom: 24px; }
.sem-group h4 { font-size: 13px; font-weight: 600; color: #525252; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }

/* gradients */
.gradient-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.gradient-card { height: 100px; border-radius: 10px; padding: 16px 20px; display: flex; flex-direction: column;
  justify-content: flex-end; color: #fff; }
.gradient-name { font-size: 14px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.3); }
.gradient-token { font-size: 11px; opacity: 0.8; margin-top: 2px; font-family: 'SF Mono', 'Fira Code', monospace; text-shadow: 0 1px 3px rgba(0,0,0,0.3); }

/* typography */
.type-category { margin-bottom: 32px; }
.type-category h4 { font-size: 13px; font-weight: 600; color: #525252; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
.type-specimen { display: flex; align-items: baseline; gap: 24px; padding: 12px 0; border-bottom: 1px solid #F5F5F5; flex-wrap: wrap; }
.type-sample { flex: 1; min-width: 200px; color: #171717; }
.type-meta { display: flex; gap: 16px; font-size: 12px; color: #737373; flex-shrink: 0; }
.type-meta span { white-space: nowrap; }
.type-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.type-table th, .type-table td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #F5F5F5; }
.type-table th { font-weight: 600; color: #525252; border-bottom-color: #E6E6E6; }
.type-table-header td { font-weight: 600; color: #2E4DE5; background: #FAFAFA; }
.type-table code { font-size: 11px; color: #525252; }

/* shadows */
.shadow-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
.shadow-card { background: #FFFFFF; border-radius: 10px; padding: 28px 20px; text-align: center; }
.shadow-label { font-size: 16px; font-weight: 700; color: #171717; }
.shadow-token { display: block; font-size: 10px; color: #A3A3A3; margin-top: 8px; font-family: 'SF Mono', 'Fira Code', monospace; }

/* spacing */
.spacing-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
.spacing-row { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.spacing-label { width: 200px; font-size: 12px; font-weight: 500; color: #525252; text-align: right; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spacing-bar { height: 20px; background: #d8dffb; border-radius: 3px; }
.spacing-value { font-size: 12px; color: #737373; white-space: nowrap; }

/* radius & border */
.radius-grid { display: flex; gap: 24px; flex-wrap: wrap; }
.radius-card { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.radius-box { width: 64px; height: 64px; background: #d8dffb; border: 2px solid #2E4DE5; }
.border-box { width: 64px; height: 64px; background: #FFFFFF; border: solid #2E4DE5; border-radius: 4px; }
.radius-label { font-size: 12px; font-weight: 600; color: #171717; }
.radius-value { font-size: 11px; color: #737373; }

/* icon sizes */
.icon-grid { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; }
.icon-card { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.icon-box { background: #2E4DE5; border-radius: 4px; opacity: 0.8; }
.icon-label { font-size: 12px; font-weight: 600; color: #171717; }
.icon-value { font-size: 11px; color: #737373; }

/* ═════════════════════════════════════════════
   Component Demos — CSS custom property based
   ═════════════════════════════════════════════ */

.component-group { margin-bottom: 32px; padding: 20px; background: #FFFFFF; border-radius: 12px; border: 1px solid rgba(0,0,0,0.06); }
.component-group h4 { font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #171717; }
.component-demo { margin-bottom: 16px; }

/* Buttons */
.button-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.btn { font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; padding: 8px 16px;
  border-radius: 6px; border: 1px solid transparent; cursor: pointer; transition: opacity 0.15s; }
.btn:hover { opacity: 0.85; }
.btn-primary {
  background: var(--components-button-primary-default-color-background);
  color: var(--components-button-primary-default-color-text, var(--components-button-primary-default-color-label, #fff));
  border-color: var(--components-button-primary-default-color-border, transparent);
}
.btn-secondary {
  background: var(--components-button-secondary-default-color-background);
  color: var(--components-button-secondary-default-color-text, var(--components-button-secondary-default-color-label, #171717));
  border-color: var(--components-button-secondary-default-color-border, #D4D4D4);
}
.btn-destructive {
  background: var(--components-button-destructive-default-color-background);
  color: var(--components-button-destructive-default-color-text, var(--components-button-destructive-default-color-label, #fff));
  border-color: var(--components-button-destructive-default-color-border, transparent);
}
.btn-success {
  background: var(--components-button-success-default-color-background, #29845A);
  color: var(--components-button-success-default-color-text, var(--components-button-success-default-color-label, #fff));
  border-color: var(--components-button-success-default-color-border, transparent);
}
.btn-ghost {
  background: var(--components-button-ghost-default-color-background, transparent);
  color: var(--components-button-ghost-default-color-text, var(--components-button-ghost-default-color-label, #2E4DE5));
  border-color: var(--components-button-ghost-default-color-border, transparent);
}
.btn-disabled {
  background: var(--components-button-primary-disabled-color-background, #E6E6E6);
  color: var(--components-button-primary-disabled-color-text, var(--components-button-primary-disabled-color-label, #A3A3A3));
  border-color: var(--components-button-primary-disabled-color-border, transparent);
  cursor: not-allowed; opacity: 0.7;
}

/* Badges */
.badge-row { display: flex; gap: 8px; flex-wrap: wrap; }
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  height: var(--components-badge-status-small-sizing-height, 24px);
  padding: 0 var(--components-badge-status-small-spacing-padding, 8px);
  border-radius: var(--components-badge-status-default-border-radius, 9999px);
  font-size: var(--components-badge-status-small-typography-font-size, 12px);
  font-weight: var(--components-badge-status-small-typography-font-weight, 500);
  line-height: var(--components-badge-status-small-typography-line-height, 1.33);
  font-family: 'Inter', sans-serif;
}
.badge-success { background: var(--components-badge-status-success-color-background); color: var(--components-badge-status-success-color-text, var(--components-badge-status-success-color-label)); }
.badge-error { background: var(--components-badge-status-error-color-background); color: var(--components-badge-status-error-color-text, var(--components-badge-status-error-color-label)); }
.badge-warning { background: var(--components-badge-status-warning-color-background); color: var(--components-badge-status-warning-color-text, var(--components-badge-status-warning-color-label)); }
.badge-info { background: var(--components-badge-status-info-color-background); color: var(--components-badge-status-info-color-text, var(--components-badge-status-info-color-label)); }
.badge-neutral { background: var(--components-badge-status-neutral-color-background); color: var(--components-badge-status-neutral-color-text, var(--components-badge-status-neutral-color-label)); }
.badge-accent { background: var(--components-badge-status-accent-weak-color-background, var(--components-badge-status-accent-color-background)); color: var(--components-badge-status-accent-weak-color-text, var(--components-badge-status-accent-color-label)); }

/* Alerts */
.alert {
  padding: var(--components-alert-toast-default-spacing-padding, 12px 16px);
  border-radius: var(--components-alert-default-default-border-radius, 6px);
  border: var(--components-alert-default-default-border-width, 1px) solid;
  font-size: 14px; margin-bottom: 8px; font-weight: 500;
}
.alert-error { background: var(--components-alert-error-light-color-background); border-color: var(--components-alert-error-default-color-border); }
.alert-warning { background: var(--components-alert-warning-light-color-background); border-color: var(--components-alert-warning-default-color-border); }
.alert-success { background: var(--components-alert-success-light-color-background); border-color: var(--components-alert-success-default-color-border); }
.alert-info { background: var(--components-alert-info-light-color-background); border-color: var(--components-alert-info-default-color-border); }

/* Inputs */
.input-demo { display: flex; flex-direction: column; gap: 12px; max-width: 360px; }
.input-field {
  font-family: 'Inter', sans-serif;
  font-size: var(--components-text-input-default-default-typography-font-size, 14px);
  line-height: var(--components-text-input-default-default-typography-line-height, 1.5);
  padding: var(--components-text-input-default-default-spacing-padding, 8px 12px);
  border: var(--components-text-input-default-default-border-width, 1px) solid var(--components-text-input-default-default-color-border, #D4D4D4);
  border-radius: var(--components-text-input-default-default-border-radius, 6px);
  background: var(--components-text-input-default-default-color-background, #fff);
  color: var(--components-text-input-default-filled-color-text, var(--components-text-input-default-default-color-text, #171717));
  outline: none;
}
.input-field::placeholder { color: var(--components-text-input-default-default-color-placeholder, #A3A3A3); }
.input-field:focus { border-color: var(--components-text-input-default-active-color-border, #2E4DE5); }
.input-field.error { border-color: var(--components-text-input-default-error-color-border, #DC2626); }
.input-label {
  font-size: var(--components-label-default-default-typography-font-size, 14px);
  line-height: var(--components-label-default-default-typography-line-height, 1.5);
  color: var(--components-label-default-default-color-text, #171717);
  font-weight: 500;
}

.comp-details { margin-top: 8px; }
.comp-details summary { font-size: 12px; font-weight: 500; color: #737373; cursor: pointer; padding: 4px 0; }
.comp-details summary:hover { color: #171717; }

/* all tokens view */
.at-controls { display: flex; gap: 12px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; }
.at-search { padding: 8px 14px; border: 1px solid #D4D4D4; border-radius: 6px; font-size: 14px;
  font-family: inherit; width: 320px; outline: none; }
.at-search:focus { border-color: #2E4DE5; }
.at-filter { padding: 8px 12px; border: 1px solid #D4D4D4; border-radius: 6px; font-size: 13px;
  font-family: inherit; background: #FFF; outline: none; cursor: pointer; }
.at-filter:focus { border-color: #2E4DE5; }
.at-results-count { font-size: 13px; color: #737373; }

.at-group { margin-bottom: 8px; }
.at-group-header { position: sticky; top: 52px; z-index: 10; background: #F5F5F5; padding: 8px 16px;
  font-size: 13px; font-weight: 600; color: #525252; text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1px solid #E6E6E6; }
.at-count { font-weight: 400; color: #A3A3A3; text-transform: none; letter-spacing: 0; }
.at-row { display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center;
  padding: 5px 16px; font-size: 13px; border-bottom: 1px solid #F5F5F5; }
.at-row:hover { background: #F5F5F5; }
.at-preview { display: flex; align-items: center; justify-content: center; }
.at-swatch { display: inline-block; width: 28px; height: 28px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.08); }
.at-shadow-preview { display: inline-block; width: 28px; height: 28px; border-radius: 4px; background: #FFF; }
.at-dim-bar { display: inline-block; height: 14px; background: #2E4DE5; border-radius: 2px; opacity: 0.6; }
.at-number { font-size: 13px; font-weight: 600; color: #2E4DE5; }
.at-text { font-size: 11px; color: #737373; }
.at-token { font-size: 11px; color: #525252; font-family: 'SF Mono', 'Fira Code', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.at-val { font-size: 11px; color: #A3A3A3; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }

@media (max-width: 900px) {
  .sidebar { display: none; }
  .main-ds { margin-left: 0; }
}
</style>
</head>
<body>

<div class="tab-bar">
  <span class="logo">Unity</span>
  <button class="tab-btn active" data-tab="ds" onclick="switchTab('ds')">Design System</button>
  <button class="tab-btn" data-tab="at" onclick="switchTab('at')">All Tokens</button>
  <span class="token-count">${totalCount} tokens</span>
</div>

<nav class="sidebar" id="sidebar">
${sidebarHtml}
</nav>

<main class="main-ds" id="view-ds">
  <div class="hero">
    <h1>Unity Design System</h1>
    <p>Visual style guide — ${totalCount} design tokens exported from Figma, powered by CSS custom properties.</p>
  </div>

  <div class="section" id="color-ramps">
    <h3>Color Ramps</h3>
    ${renderColorRamps()}
  </div>

  <div class="section" id="alpha-colors">
    <h3>Alpha Colors</h3>
    ${renderAlphaColors()}
  </div>

  ${categories.colorsOther.length > 0 ? `<div class="section" id="colors-other">
    <h3>Other Colors</h3>
    ${renderColorsOther()}
  </div>` : ''}

  <div class="section" id="semantic-colors">
    <h3>Semantic Colors</h3>
    ${renderSemanticColors()}
  </div>

  <div class="section" id="gradients">
    <h3>Gradients</h3>
    ${renderGradients()}
  </div>

  <div class="section" id="typography">
    <h3>Typography</h3>
    ${renderTextStyles()}
  </div>

  <div class="section" id="typescale">
    <h3>Typescale</h3>
    ${renderTypescale()}
  </div>

  <div class="section" id="shadows">
    <h3>Shadows</h3>
    ${renderShadows()}
  </div>

  <div class="section" id="spacing">
    <h3>Spacing</h3>
    ${renderSpacing()}
  </div>

  <div class="section" id="border-radius">
    <h3>Border Radius</h3>
    ${renderBorderRadius()}
  </div>

  <div class="section" id="border-weights">
    <h3>Border Weights</h3>
    ${renderBorderWeights()}
  </div>

  ${categories.borderShadows.length > 0 ? `<div class="section" id="border-shadows">
    <h3>Shadow Dimensions</h3>
    ${renderBorderShadows()}
  </div>` : ''}

  <div class="section" id="icon-sizes">
    <h3>Icon Sizes</h3>
    ${renderIconSizes()}
  </div>

  <div class="section" id="brands">
    <h3>Brands &amp; Feedback</h3>
    ${renderBrands()}
  </div>

  <div class="section" id="components">
    <h3>Component Tokens</h3>
    ${renderComponents()}
  </div>

  <div class="section" id="typography-vars">
    <h3>Typography Variables</h3>
    ${renderTypographyVars()}
  </div>

  ${miscTokens.length > 0 ? `<div class="section" id="miscellaneous">
    <h3>Miscellaneous</h3>
    ${renderMisc()}
  </div>` : ''}
</main>

<main class="main-at" id="view-at" style="display:none">
  <div class="at-controls">
    <input type="text" class="at-search" id="at-search" placeholder="Search tokens..." oninput="filterTokens()">
    <select class="at-filter" id="at-filter" onchange="filterTokens()">
      <option value="">All categories</option>
      ${allCats.map(c => `<option value="${escHtml(c)}">${escHtml(humanize(c))}</option>`).join('\n')}
    </select>
    <span class="at-results-count" id="at-results-count">${totalCount} tokens</span>
  </div>
  ${renderAllTokens()}
</main>

<script>
function switchTab(tab) {
  var ds = document.getElementById('view-ds');
  var at = document.getElementById('view-at');
  var sidebar = document.getElementById('sidebar');
  var btns = document.querySelectorAll('.tab-btn');

  if (tab === 'ds') {
    ds.style.display = '';
    at.style.display = 'none';
    sidebar.style.display = '';
    btns[0].classList.add('active');
    btns[1].classList.remove('active');
  } else {
    ds.style.display = 'none';
    at.style.display = '';
    sidebar.style.display = 'none';
    btns[0].classList.remove('active');
    btns[1].classList.add('active');
  }
}

function filterTokens() {
  var q = document.getElementById('at-search').value.toLowerCase();
  var cat = document.getElementById('at-filter').value;
  var rows = document.querySelectorAll('.at-row');
  var groups = document.querySelectorAll('.at-group');
  var visible = 0;

  rows.forEach(function(row) {
    var name = row.getAttribute('data-name');
    var value = row.getAttribute('data-value');
    var rowCat = row.getAttribute('data-cat');
    var matchQ = !q || name.indexOf(q) !== -1 || value.indexOf(q) !== -1;
    var matchCat = !cat || rowCat === cat;
    if (matchQ && matchCat) {
      row.style.display = '';
      visible++;
    } else {
      row.style.display = 'none';
    }
  });

  groups.forEach(function(g) {
    var groupCat = g.getAttribute('data-group-cat');
    if (cat && groupCat !== cat) {
      g.style.display = 'none';
    } else {
      var visibleRows = g.querySelectorAll('.at-row:not([style*="display: none"])');
      g.style.display = visibleRows.length > 0 ? '' : 'none';
    }
  });

  document.getElementById('at-results-count').textContent = visible + ' token' + (visible !== 1 ? 's' : '');
}
</script>

</body>
</html>`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, 'utf-8');
console.log(`Generated preview.html with ${totalCount} tokens.`);
