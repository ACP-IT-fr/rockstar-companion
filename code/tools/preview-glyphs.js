// Rend les glyphes générés dans une page HTML pour inspection visuelle.
const fs = require('fs');
const src = fs.readFileSync('code/extension/widgets/metronome.js', 'utf8');
const p1 = src.indexOf('const RHYTHM_PATTERNS');
const p2 = src.indexOf('];', p1) + 2;
const b1 = src.indexOf('const METRONOME_GLYPH_SVGS');
const b2 = src.indexOf('// END GENERATED METRONOME GLYPHS');
eval(src.slice(p1, p2) + '\n' + src.slice(b1, b2) + `
let html = '<body style="background:#1f2430;color:#4cc9f0;display:flex;flex-wrap:wrap;gap:6px;padding:10px">';
RHYTHM_PATTERNS.forEach(p => {
  html += '<div style="background:#262b36;border:1px solid #3a4050;border-radius:8px;padding:6px 4px 4px;text-align:center;width:88px">'
    + '<div style="height:40px;display:flex;align-items:center;justify-content:center">' + METRONOME_GLYPH_SVGS[p.id] + '</div>'
    + '<div style="font-size:8.5px;color:#9aa0ae">' + p.name + '</div></div>';
});
fs.writeFileSync('/tmp/metronome-glyphs-v6.html', html + '</body>');
console.log('ok');
`);
