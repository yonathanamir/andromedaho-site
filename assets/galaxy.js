/* The sector-transit galaxy from Andromeda, Ho!, running in WebGL.
 *
 * - GodotRng: a port of Godot 4's RandomNumberGenerator (pcg32, randf, randi_range). Checked
 *   bit-exact against Godot headless, so a seed gives the same galaxy as the game.
 * - rollGalaxy: SpiralGalaxyVisual.RollParametersFromSeed + Regenerate (palette + seed offset).
 * - FRAG: Shaders/spiral_galaxy.gdshader ported to GLSL ES 1.0, line for line.
 * - Overlay: SpiralGalaxyVisual.ProjectDisc separators + the faction's player hull on Sector 1.
 *
 * Usage: var g = AndromedaGalaxy.start(hostEl, glCanvas, overlayCanvas, 'imperium');
 *        g.setFaction('corsair'); g.reroll(); g.seedHex();
 */
(function () {
  'use strict';

  var M64 = (1n << 64n) - 1n;
  function GodotRng(seed) {
    this.inc = ((1442695040888963407n << 1n) | 1n) & M64;
    this.state = 0n;
    this.next();
    this.state = (this.state + BigInt.asUintN(64, seed)) & M64;
    this.next();
  }
  GodotRng.prototype.next = function () {
    var old = this.state;
    this.state = (old * 6364136223846793005n + this.inc) & M64;
    var xs = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    var rot = Number(old >> 59n);
    return ((xs >>> rot) | (xs << ((-rot) & 31))) >>> 0;
  };
  GodotRng.prototype.randf = function () {
    var e = this.next();
    if (e === 0) return 0;
    var sig = Math.fround((this.next() | 0x80000001) >>> 0);
    return Math.fround(sig * Math.pow(2, -32 - Math.clz32(e)));
  };
  GodotRng.prototype.randfRange = function (a, b) {
    a = Math.fround(a); b = Math.fround(b);
    return Math.fround(Math.fround(this.randf() * Math.fround(b - a)) + a);
  };
  GodotRng.prototype.randiRange = function (a, b) {
    if (a === b) return a;
    var bound = (Math.abs(a - b) + 1) >>> 0;
    var threshold = ((-bound >>> 0) % bound) >>> 0;
    for (;;) { var r = this.next(); if (r >= threshold) return (r % bound) + Math.min(a, b); }
  };

  var PALETTES = [
    { name: 'ANDROMEDA CLASSIC', stops: [[0, [1, .92, .72]], [.25, [1, .78, .45]], [.55, [.85, .82, .72]], [.8, [.62, .76, 1]], [1, [.42, .58, 1]]], core: [1, .85, .55] },
    { name: 'COLD NEON', stops: [[0, [.95, 1, 1]], [.3, [.6, .95, 1]], [.65, [.35, .7, 1]], [1, [.32, .42, .95]]], core: [.8, .98, 1] },
    { name: 'VOID BLOOM', stops: [[0, [1, .8, .45]], [.3, [.95, .45, .9]], [.65, [.65, .4, 1]], [1, [.4, .85, .95]]], core: [1, .85, .55] },
    { name: 'AURORA', stops: [[0, [1, .95, .85]], [.3, [.3, .9, .75]], [.65, [.5, 1, .7]], [1, [.35, .75, .95]]], core: [1, .92, .7] },
    { name: 'EMBER RIM', stops: [[0, [1, .95, .88]], [.28, [1, .7, .35]], [.6, [1, .38, .32]], [1, [.62, .42, .92]]], core: [1, .88, .62] }
  ];
  function samplePalette(i, t) {
    var s = PALETTES[i].stops; t = Math.min(1, Math.max(0, t));
    for (var k = 1; k < s.length; k++) {
      if (t <= s[k][0]) {
        var u = (t - s[k - 1][0]) / (s[k][0] - s[k - 1][0]);
        return [0, 1, 2].map(function (c) { return s[k - 1][1][c] + (s[k][1][c] - s[k - 1][1][c]) * u; });
      }
    }
    return s[s.length - 1][1];
  }
  function paletteSet(i) {
    var out = [];
    for (var k = 0; k < 5; k++) out.push(samplePalette(i, k / 4));
    out.push(PALETTES[i].core.slice());
    return out;
  }
  function shaderPalette(set, t) {
    t = Math.min(1, Math.max(0, t)) * 4;
    var c = set[0].slice();
    for (var k = 1; k < 5; k++) {
      var u = Math.min(1, Math.max(0, t - (k - 1)));
      for (var j = 0; j < 3; j++) c[j] += (set[k][j] - c[j]) * u;
    }
    return c;
  }
  function rollGalaxy(seed) {
    var r = new GodotRng(seed);
    var g = { seed: seed, palette: r.randiRange(0, 4) };
    g.seedOffset = [r.randfRange(-500, 500), r.randfRange(-500, 500)];
    var q = new GodotRng(seed ^ 0x9E3779B97F4A7C15n);
    g.armCount = q.randiRange(2, 4); g.pitch = q.randfRange(.25, .35); g.armWidth = q.randfRange(.5, 1);
    g.barLength = q.randfRange(.1, .5); g.barAxisRatio = q.randfRange(.15, .65); g.barStrength = q.randfRange(.5, 2);
    g.cloudAmount = q.randfRange(.6, 1); g.cloudScale = q.randfRange(.5, 2.5);
    g.starDensity = q.randfRange(.6, 1.2); g.starSize = q.randfRange(1, 1.5);
    g.swirlSpeedDeg = q.randfRange(1, 1.5); g.differentialK = q.randfRange(0, .15);
    g.twinkle = q.randfRange(.5, .8); g.brightness = q.randfRange(1, 1.5);
    g.mirrored = q.randf() < .5;
    g.altitudeDeg = q.randfRange(15, 30); g.azimuthDeg = q.randfRange(-45, 45);
    return g;
  }
  function randomSeed() {
    var a = new Uint32Array(2);
    window.crypto.getRandomValues(a);
    return (BigInt(a[0]) << 32n) | BigInt(a[1]);
  }
  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; }

  // Per faction: panel backdrop and the real player hulls (player_ship / player_ship_corsair /
  // player_ship_voidborn), half-size 1, nose at -y. The galaxy palette comes from the seed, as in game.
  var FACTIONS = {
    imperium: { deep: '#030b16', bright: '#8fd0ff', ship: '#177dff', shipCore: '#b5dcff', shipAcc: null,
      hull: [[0, -0.88], [0.18, -0.35], [0.58, 0.3], [0.2, 0.22], [0, 0.5], [-0.2, 0.22], [-0.58, 0.3], [-0.18, -0.35]] },
    corsair: { deep: '#0d0504', bright: '#ff7a45', ship: '#ff4000', shipCore: '#ffc8ad', shipAcc: null,
      hull: [[0, -0.95], [0.22, -0.3], [0.65, 0.25], [0.15, 0.3], [0, 0.42], [-0.15, 0.3], [-0.65, 0.25], [-0.22, -0.3]] },
    voidborn: { deep: '#07040f', bright: '#a77bff', ship: '#6114e6', shipCore: '#c7a6ff', shipAcc: '#34c5ff',
      hull: [[0, -0.95], [0.16, -0.5], [0.24, -0.34], [0.66, 0.04], [0.3, 0.18], [0.24, 0.5], [0.13, 0.6], [0, 0.38], [-0.13, 0.6], [-0.24, 0.5], [-0.3, 0.18], [-0.66, 0.04], [-0.24, -0.34], [-0.16, -0.5]] }
  };

  // Game chart geometry at ChartWidth 1080: rim = 0.77 W, core = 0.07 W.
  var RIM = 1080 * 0.77, CORE = 1080 * 0.07, SWITCH_SEC = 0.9;

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_center;uniform float u_scale;uniform vec3 u_bg;',
    'uniform float rim_radius,core_radius,arm_count,pitch,arm_width,bar_length,bar_axis_ratio,bar_strength;',
    'uniform float swirl_speed,differential,chart_time,cloud_amount,cloud_scale,star_density,star_size,twinkle;',
    'uniform float brightness,mirror_x,azimuth,altitude;uniform vec2 seed_offset;',
    'uniform vec3 pal_c0,pal_c1,pal_c2,pal_c3,pal_c4,core_color;',
    'float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}',
    'vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract(vec2((p3.x+p3.y)*p3.z,(p3.x+p3.z)*p3.y));}',
    'float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.-2.*f);float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,amp=.5;mat2 rot=mat2(vec2(.8,.6),vec2(-.6,.8));for(int i=0;i<4;i++){v+=amp*vnoise(p);p=rot*p*2.;amp*=.5;}return v;}',
    'vec3 palette(float t){t=clamp(t,0.,1.)*4.;vec3 c=mix(pal_c0,pal_c1,clamp(t,0.,1.));c=mix(c,pal_c2,clamp(t-1.,0.,1.));c=mix(c,pal_c3,clamp(t-2.,0.,1.));c=mix(c,pal_c4,clamp(t-3.,0.,1.));return c;}',
    'vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return vec2(c*p.x-s*p.y,s*p.x+c*p.y);}',
    'float star_layer(vec2 u,float cell,float prob,float size_px,float density,float t){vec2 g=u/cell;vec2 id=floor(g);vec2 f=fract(g)-.5;vec2 h=hash22(id+seed_offset*3.1);float gate=hash(id*1.71+seed_offset+4.13);float sel=step(gate,prob*clamp(density,0.,1.));vec2 spos=(h-.5)*.68;float d=length(f-spos)*cell;float tw=1.-twinkle*.5*(1.+sin(t*(1.+5.*h.x)+h.y*6.2832));float s=size_px*star_size*(.7+.6*h.y);return sel*tw*exp(-d*d/(s*s));}',
    'void main(){',
    ' vec2 ps=vec2(gl_FragCoord.x-u_center.x,u_center.y-gl_FragCoord.y)/u_scale;',
    ' vec2 pr=rot2(ps,-azimuth);float minor=max(sin(altitude),.03);vec2 p=vec2(pr.x,pr.y/minor);p.x*=mirror_x;',
    ' float r=length(p);float phi=atan(p.y,p.x);float t=chart_time;',
    ' float ref_r=rim_radius*.45;float omega=swirl_speed*pow(ref_r/max(r,10.),differential);float pattern_omega=swirl_speed*.55;',
    ' float phi_pat=phi-pattern_omega*t;vec2 p_pat=rot2(p,-pattern_omega*t);',
    ' float rt=clamp((r-core_radius)/(rim_radius-core_radius),0.,1.);vec3 base=palette(rt);',
    ' float disc=exp(-r/(rim_radius*.55))*smoothstep(rim_radius*1.08,rim_radius*.80,r);',
    ' float bar_l=bar_length*rim_radius;float sarm=phi_pat-log(max(r,1.)/bar_l)/pitch;',
    ' float armw=pow(.5+.5*cos(sarm*arm_count),mix(6.,1.3,arm_width));float armzone=smoothstep(bar_l*.65,bar_l*1.45,r);',
    ' float arm_density=mix(.14,1.,armw)*armzone;',
    ' float xb=p_pat.x/bar_l;float yb=p_pat.y/(bar_l*bar_axis_ratio);',
    ' float bar=bar_strength*exp(-(xb*xb+yb*yb)*2.4)*smoothstep(core_radius*.4,core_radius*1.1,r);',
    ' float bulge=exp(-pow(r/core_radius,2.)*.9);float density=disc*(.22+arm_density)+bar*.9+bulge;',
    ' vec2 u=rot2(p,-omega*t);vec2 nuv=u*cloud_scale/rim_radius;',
    ' float n1=fbm(nuv*3.+seed_offset);float n2=fbm(nuv*7.-seed_offset.yx*1.7+13.7);',
    ' float knots=smoothstep(.42,.85,n1*.62+n2*.48);float cloud=cloud_amount*density*(.30*n1+.85*knots);',
    ' vec3 cloud_col=mix(base,mix(base,vec3(1.),.55),knots);',
    ' float sd=density*star_density*1.5;',
    ' float s1=star_layer(u,26.,.42,2.1,sd,t);float s2=star_layer(u+37.,14.,.48,1.35,sd,t);float s3=star_layer(u+91.,8.,.55,.95,sd*1.2,t);',
    ' vec3 star_col=mix(base,vec3(1.),.45)*(s2+s3)+mix(base,vec3(1.),.75)*s1;',
    ' vec3 core=core_color*bulge*.55+vec3(1.)*exp(-pow(r/(core_radius*.30),2.))*.9;',
    ' vec3 col=base*density*.10+cloud_col*cloud*.55+star_col+core;',
    ' float sky=star_layer(ps*u_scale+vec2(311.,173.),34.,.16,.9,1.,t*.6)*.55;',
    ' gl_FragColor=vec4(u_bg+col*brightness+vec3(.75,.82,1.)*sky,1.);',
    '}'
  ].join('\n');

  function start(host, glCanvas, ovCanvas, faction) {
    var gl = glCanvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    var S = {
      g: rollGalaxy(randomSeed()), faction: faction, shipFaction: faction,
      t0: performance.now() / 1000 - 40, palT0: -10, switchP: 1, dpr: 1, scale: 1, baseScale: 1, cx: 0, cy: 0
    };
    // Palette = the seed's own (SpiralGalaxyVisual.Regenerate, no PaletteOverride).
    function useSeedPalette() { S.pal = paletteSet(S.g.palette); S.palFrom = S.pal; S.palTo = S.pal; }
    useSeedPalette();
    S.bg = hexRgb(FACTIONS[faction].deep);
    var api = {
      // A faction switch eases only the backdrop and swaps the ship; the galaxy keeps its colors.
      setFaction: function (f) {
        if (!FACTIONS[f] || f === S.faction) return;
        S.faction = f;
        S.bgFrom = S.bg.slice(); S.bgTo = hexRgb(FACTIONS[f].deep);
        S.palT0 = performance.now() / 1000;
        if (!gl) S.shipFaction = f;
      },
      reroll: function () {
        S.g = rollGalaxy(randomSeed());
        useSeedPalette();
        S.t0 = performance.now() / 1000 - 40;
        if (gl) pushSeed();
      },
      seedHex: function () { return '0x' + S.g.seed.toString(16).toUpperCase().padStart(16, '0'); }
    };
    if (!gl) return api; // No WebGL: the panel keeps its dark backdrop.

    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return api;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    function uni(n) { if (!(n in U)) U[n] = gl.getUniformLocation(prog, n); return U[n]; }

    function pushPalette() {
      for (var i = 0; i < 5; i++) gl.uniform3f(uni('pal_c' + i), S.pal[i][0], S.pal[i][1], S.pal[i][2]);
      gl.uniform3f(uni('core_color'), S.pal[5][0], S.pal[5][1], S.pal[5][2]);
      gl.uniform3f(uni('u_bg'), S.bg[0], S.bg[1], S.bg[2]);
    }
    function pushSeed() {
      var g = S.g;
      var f = { rim_radius: RIM, core_radius: CORE, arm_count: g.armCount, pitch: g.pitch, arm_width: g.armWidth,
        bar_length: g.barLength, bar_axis_ratio: g.barAxisRatio, bar_strength: g.barStrength,
        swirl_speed: g.swirlSpeedDeg * Math.PI / 180, differential: g.differentialK,
        cloud_amount: g.cloudAmount, cloud_scale: g.cloudScale, star_density: g.starDensity, star_size: g.starSize,
        twinkle: g.twinkle, brightness: g.brightness, mirror_x: g.mirrored ? -1 : 1,
        azimuth: g.azimuthDeg * Math.PI / 180, altitude: g.altitudeDeg * Math.PI / 180 };
      for (var k in f) gl.uniform1f(uni(k), f[k]);
      gl.uniform2f(uni('seed_offset'), g.seedOffset[0], g.seedOffset[1]);
      pushPalette();
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      S.dpr = dpr;
      var w = Math.max(1, Math.round(host.clientWidth * dpr)), h = Math.max(1, Math.round(host.clientHeight * dpr));
      glCanvas.width = ovCanvas.width = w;
      glCanvas.height = ovCanvas.height = h;
      gl.viewport(0, 0, w, h);
      S.baseScale = Math.min(w / (2 * RIM * 1.02), h / (2 * RIM * 0.82));
      S.cx = w / 2; S.cy = h / 2;
      frame(performance.now() / 1000);
    }

    // SpiralGalaxyVisual.ProjectDisc: chirality mirror, foreshortening by altitude, azimuth roll.
    function project(r, a) {
      var g = S.g, s = S.scale;
      var x = Math.cos(a) * r * (g.mirrored ? -1 : 1), y = Math.sin(a) * r * Math.sin(g.altitudeDeg * Math.PI / 180);
      var az = g.azimuthDeg * Math.PI / 180, c = Math.cos(az), n = Math.sin(az);
      return [S.cx + (x * c - y * n) * s, S.cy + (x * n + y * c) * s];
    }

    function drawOverlay(t, now) {
      var ctx = ovCanvas.getContext('2d'), g = S.g, d = S.dpr;
      ctx.clearRect(0, 0, ovCanvas.width, ovCanvas.height);
      var radii = [RIM, RIM * 0.6, RIM * 0.2];
      ctx.lineWidth = 1.2;
      for (var j = 0; j < radii.length; j++) {
        var col = shaderPalette(S.pal, (radii[j] - CORE) / (RIM - CORE));
        ctx.strokeStyle = 'rgba(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ',0.25)';
        ctx.beginPath();
        for (var i = 0; i < 96; i += 2) {
          var a0 = project(radii[j], Math.PI * 2 * i / 96), a1 = project(radii[j], Math.PI * 2 * (i + 1) / 96);
          ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]);
        }
        ctx.stroke();
      }
      var rr = RIM * 0.8;
      var omega = g.swirlSpeedDeg * Math.PI / 180 * Math.pow(RIM * 0.45 / rr, g.differentialK);
      var ang = 2.2 + omega * t;
      var p = project(rr, ang), q = project(rr, ang + 0.02);
      var dir = Math.atan2(q[1] - p[1], q[0] - p[0]);
      var F = FACTIONS[S.shipFaction], k = 17 * d, sw = S.switchP;
      var pop = sw < 1 ? Math.abs(Math.cos(Math.PI * sw)) : 1;
      ctx.save();
      ctx.translate(p[0], p[1]);
      if (sw < 1) {
        ctx.strokeStyle = FACTIONS[S.faction].bright; ctx.globalAlpha = 1 - sw; ctx.lineWidth = 1.5 * d;
        ctx.beginPath(); ctx.arc(0, 0, k * (0.6 + 2.2 * sw), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.rotate(dir + Math.PI / 2);
      ctx.scale(pop, pop);
      var flick = 0.75 + 0.25 * Math.sin(now * 23) * Math.sin(now * 7.3);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = F.ship; ctx.shadowColor = F.ship; ctx.shadowBlur = 10 * d; ctx.lineWidth = 1.6 * d;
      ctx.beginPath(); ctx.moveTo(-0.1 * k, 0.5 * k); ctx.lineTo(0, (0.62 + 0.4 * flick) * k); ctx.lineTo(0.1 * k, 0.5 * k); ctx.stroke();
      ctx.beginPath();
      F.hull.forEach(function (pt, i) { if (i === 0) ctx.moveTo(pt[0] * k, pt[1] * k); else ctx.lineTo(pt[0] * k, pt[1] * k); });
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
      ctx.lineWidth = 2.6 * d; ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = F.shipCore; ctx.lineWidth = 0.9 * d; ctx.stroke();
      if (F.shipAcc) {
        ctx.strokeStyle = F.shipAcc; ctx.shadowColor = F.shipAcc; ctx.shadowBlur = 6 * d; ctx.lineWidth = 1.2 * d;
        ctx.beginPath(); ctx.moveTo(0, -0.4 * k); ctx.lineTo(0.09 * k, -0.18 * k); ctx.lineTo(0, 0.02 * k); ctx.lineTo(-0.09 * k, -0.18 * k); ctx.closePath(); ctx.stroke();
      }
      ctx.restore();
    }

    function frame(now) {
      var p = Math.min(1, Math.max(0, (now - S.palT0) / SWITCH_SEC));
      S.switchP = p;
      if (p < 1 || S.palDirty) {
        var e = p * p * (3 - 2 * p);
        S.pal = S.palTo.map(function (c, i) { return c.map(function (v, j) { return S.palFrom[i][j] + (v - S.palFrom[i][j]) * e; }); });
        if (S.bgTo) S.bg = S.bgTo.map(function (v, j) { return S.bgFrom[j] + (v - S.bgFrom[j]) * e; });
        pushPalette();
        S.palDirty = p < 1;
        if (p >= 0.5) S.shipFaction = S.faction;
      }
      S.scale = S.baseScale * (1 - 0.06 * Math.sin(Math.PI * p));
      var t = now - S.t0;
      gl.uniform2f(uni('u_center'), S.cx, glCanvas.height - S.cy);
      gl.uniform1f(uni('u_scale'), S.scale);
      gl.uniform1f(uni('chart_time'), t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawOverlay(t, now);
    }

    pushSeed();
    var visible = true;
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(host);
    resize();
    // 30 fps cap; idle while off screen or in a background tab (battery).
    var last = 0;
    (function loop(ms) {
      requestAnimationFrame(loop);
      if (!visible || document.hidden || ms - last < 33) return;
      last = ms;
      frame(ms / 1000);
    })(0);
    return api;
  }

  window.AndromedaGalaxy = { start: start, rollGalaxy: rollGalaxy, GodotRng: GodotRng };
})();
