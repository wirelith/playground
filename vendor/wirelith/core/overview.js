// SPDX-License-Identifier: MIT
// The overview (spec sections 6, 7.4 and 10.6): frames placed in groups, notes below them, and
// arrows routed through the gaps between frames.
import { OVERLAYS } from './components.js';
import { Layout } from './layout.js';
import { measure, r, wrap } from './measure.js';
import { walk } from './validate.js';
const MARGIN = 32;
const TITLE = 32;
const H_GAP = 96;
const V_GAP = 64;
const NOTES_GAP = 24;
/** The narrowest a notes list may be. It is otherwise as wide as its frame. */
const NOTES_W = 240;
const LANE = 12;
/** A lane that carries a label is this far from the lane (or the titles) below it. */
const LABELLED_LANE = 24;
/** The widest the overview may be (spec section 16); groups wrap into a new band beyond it. */
const CANVAS = 16000;
const isVariant = (s) => {
    const of = s.attrs?.of;
    return typeof of === 'object' && of !== null && !Array.isArray(of);
};
const has = (n, f) => n.flags?.includes(f) ?? false;
/** Every laid-out element in a frame, with its box. */
export function frameElements(f) {
    const out = [];
    const visit = (l) => {
        out.push(l);
        for (const c of l.children)
            visit(c);
    };
    if (f.header)
        visit(f.header);
    if (f.footer)
        visit(f.footer);
    for (const s of f.sidebars)
        visit(s);
    for (const b of f.body)
        visit(b);
    for (const o of f.open)
        visit(o);
    return out;
}
export function buildOverview(doc, theme, opts) {
    const layout = new Layout(doc, theme);
    const u = layout.u;
    const all = walk(doc);
    const showNotes = opts.notes !== false;
    const showFlows = opts.flows !== false;
    const keyOf = (n) => n.id ?? `n${layout.index.get(n) ?? 0}`;
    // Which overlays are link targets.
    const linkedOverlays = new Set();
    for (const w of all)
        if (w.node.link)
            linkedOverlays.add(w.node.link.to);
    const overlaysOf = (s) => (s.children ?? []).filter((c) => OVERLAYS.has(c.type));
    const baseFrame = new Map();
    const extraFrame = new Map();
    const decorate = (f) => ({ ...f, markers: [], notesList: [] });
    // One screen or overlay, chosen by the host.
    let groups = [];
    let alone = false;
    if (opts.screen !== undefined) {
        const target = all.find((w) => w.node.id === opts.screen);
        if (!target || (target.node.type !== 'screen' && !OVERLAYS.has(target.node.type))) {
            throw new Error(`The screen option names "${opts.screen}", which is not a screen, modal or drawer in this source`);
        }
        const s = target.screen;
        const open = overlaysOf(s).filter((o) => has(o, 'open'));
        let f;
        if (target.node.type === 'screen') {
            f = decorate(layout.frame(s, keyOf(s), open));
            baseFrame.set(s, f);
        }
        else {
            const o = target.node;
            f = decorate(layout.frame(s, `${keyOf(o)}-frame`, open.includes(o) ? open : [...open, o], o));
            extraFrame.set(o, f);
        }
        groups = [[[f]]];
        alone = true;
    }
    else {
        const byId = new Map(doc.screens.filter((s) => s.id).map((s) => [s.id, s]));
        const rowOf = new Map();
        for (const s of doc.screens) {
            const open = overlaysOf(s).filter((o) => has(o, 'open'));
            const base = decorate(layout.frame(s, keyOf(s), open));
            baseFrame.set(s, base);
            const row = [base];
            for (const o of overlaysOf(s)) {
                if (has(o, 'open') || o.id === undefined || !linkedOverlays.has(o.id))
                    continue;
                const ef = decorate(layout.frame(s, `${keyOf(o)}-frame`, [...open, o], o));
                extraFrame.set(o, ef);
                row.push(ef);
            }
            rowOf.set(s, row);
        }
        const baseOf = (s) => {
            const of = s.attrs?.of;
            return isVariant(s) && typeof of === 'object' && !Array.isArray(of) ? byId.get(of.ref) : undefined;
        };
        // Every screen that is not a variant starts a group, in source order. Then each variant
        // joins its base's group, in source order, wherever it is written.
        const groupOf = new Map();
        for (const s of doc.screens) {
            if (baseOf(s))
                continue;
            const g = [rowOf.get(s)];
            groups.push(g);
            groupOf.set(s, g);
        }
        for (const s of doc.screens) {
            const b = baseOf(s);
            if (!b)
                continue;
            const g = groupOf.get(b);
            if (g)
                g.push(rowOf.get(s));
            else
                groups.push([rowOf.get(s)]);
        }
        const frameCount = groups.reduce((n, g) => n + g.reduce((m, rw) => m + rw.length, 0), 0);
        const anyLink = all.some((w) => w.node.link) || (doc.flows?.length ?? 0) > 0;
        alone = doc.screens.length === 1 && frameCount === 1 && !anyLink;
    }
    // Notes: a list below each base frame, and markers wherever their target is drawn. The list
    // is below, not beside, so arrows, which only cross the gaps beside and above frames, never
    // cross it.
    if (showNotes) {
        for (const s of doc.screens) {
            const notes = (s.children ?? []).filter((c) => c.type === 'note');
            if (notes.length === 0)
                continue;
            const base = baseFrame.get(s);
            const font = layout.body(13, 400);
            const listW = Math.max(base?.w ?? 0, NOTES_W);
            notes.forEach((note, i) => {
                const number = i + 1;
                const f = note.attrs?.for;
                const named = typeof f === 'object' && f !== null && !Array.isArray(f) ? f.ref : undefined;
                // A note whose for= names its own screen is about the whole screen, like one without for=.
                const ref = named === s.id ? undefined : named;
                for (const frame of [base, ...overlaysOf(s).map((o) => extraFrame.get(o))]) {
                    if (!frame)
                        continue;
                    if (ref === undefined) {
                        if (frame === base)
                            frame.markers.push({ number, x: frame.w, y: 0 });
                        continue;
                    }
                    const scope = frame === base ? frameElements(frame) : frame.overlay ? collect(frame.overlay) : [];
                    const target = scope.find((l) => l.node.id === ref);
                    if (target)
                        frame.markers.push({ number, x: target.box.x + target.box.w, y: target.box.y });
                }
                if (base)
                    base.notesList.push({ number, lines: wrap(note.label ?? '', font, listW - 24).lines });
            });
            if (base) {
                base.notesW = listW;
                base.notesH =
                    18 +
                        2 * u +
                        base.notesList.reduce((h, n) => h + n.lines.length * 18, 0) +
                        (base.notesList.length - 1) * 2 * u;
            }
        }
    }
    const outer = (f) => Math.max(f.w, f.notesW);
    const tall = (f) => (f.notesH > 0 ? f.h + NOTES_GAP + f.notesH : f.h);
    // Groups go left to right in bands. A group that would make the canvas wider than allowed
    // starts a new band below (spec section 7.4).
    // A group's frames are aligned in columns: the j-th frame of every row starts at column j, and
    // each column is as wide as its widest frame. The gaps between columns are then clear from the
    // top of the band to the bottom, so an arrow running down one never crosses a frame.
    const columnXs = (g) => {
        const widths = [];
        for (const row of g) {
            for (const [j, f] of row.entries())
                widths[j] = Math.max(widths[j] ?? 0, outer(f));
        }
        const xs = [];
        let x = 0;
        for (const w of widths) {
            xs.push(x);
            x += w + H_GAP;
        }
        xs.push(x - H_GAP); // the right edge of the last column
        return xs;
    };
    const groupWidth = (g) => columnXs(g).at(-1) ?? 0;
    const groupHeight = (g) => g.reduce((h, row) => h + Math.max(...row.map(tall)), 0) + V_GAP * (g.length - 1);
    const bands = [];
    {
        let x = MARGIN;
        for (const g of groups) {
            const w = groupWidth(g);
            const band = bands[bands.length - 1];
            if (!band || (band.length > 0 && x + w + MARGIN > CANVAS)) {
                bands.push([g]);
                x = MARGIN + w + H_GAP;
            }
            else {
                band.push(g);
                x += w + H_GAP;
            }
        }
    }
    const bandOf = new Map();
    bands.forEach((band, b) => {
        for (const g of band)
            for (const row of g)
                for (const f of row)
                    bandOf.set(f, b);
    });
    /** Places every frame. `lanes[b]` is how tall the lanes above band b are. Returns band tops. */
    const place = (lanes) => {
        const tops = [];
        let top = MARGIN + (lanes[0] ?? 0) + TITLE;
        bands.forEach((band, b) => {
            if (b > 0)
                top += H_GAP + (lanes[b] ?? 0);
            tops.push(top);
            let x = MARGIN;
            let bandH = 0;
            for (const g of band) {
                let y = top;
                const cols = columnXs(g);
                for (const row of g) {
                    let rh = 0;
                    for (const [j, f] of row.entries()) {
                        f.x = r(x + (cols[j] ?? 0));
                        f.y = r(y);
                        rh = Math.max(rh, tall(f));
                    }
                    y += rh + V_GAP;
                }
                x += groupWidth(g) + H_GAP;
                bandH = Math.max(bandH, groupHeight(g));
            }
            top += bandH;
        });
        return tops;
    };
    const frames = groups.flat(2);
    if (alone) {
        const f = frames[0];
        // A marker on the frame's own corner reaches 9 px past it; leave room so it isn't cut off.
        const room = f.markers.some((m) => m.x === f.w && m.y === 0) ? 9 : 0;
        f.x = 0;
        f.y = room;
        return {
            frames,
            arrows: [],
            width: r(Math.max(outer(f), f.w + room)),
            height: r(tall(f) + room),
            alone,
            layout,
            linkCount: countLinks(doc),
        };
    }
    // Lanes are counted on a first pass, then the bands move apart to make room for them.
    let tops = place([]);
    let arrows = showFlows
        ? route(doc, all, bands, bandOf, tops, baseFrame, extraFrame, outer, columnXs)
        : { arrows: [], lanes: [] };
    if (arrows.lanes.some((n) => n > 0)) {
        tops = place(arrows.lanes);
        arrows = route(doc, all, bands, bandOf, tops, baseFrame, extraFrame, outer, columnXs);
    }
    let width = 0;
    let height = 0;
    for (const f of frames) {
        width = Math.max(width, f.x + outer(f));
        height = Math.max(height, f.y + tall(f));
    }
    // A label on a lane near the edge of the canvas moves inward so that it stays on the canvas.
    const canvasW = r(width + MARGIN);
    const labelFont = layout.body(13, 500);
    for (const a of arrows.arrows) {
        if (a.label === undefined || a.label === '')
            continue;
        const half = (measure(a.label.replace(/\n/g, ' '), labelFont) + 2 * u) / 2;
        a.mid = [r(Math.min(Math.max(a.mid[0], half), canvasW - half)), a.mid[1]];
    }
    return {
        frames,
        arrows: arrows.arrows,
        width: canvasW,
        height: r(height + MARGIN),
        alone,
        layout,
        linkCount: countLinks(doc),
    };
}
function collect(l) {
    const out = [l];
    for (const c of l.children)
        out.push(...collect(c));
    return out;
}
export function countLinks(doc) {
    let n = doc.flows?.length ?? 0;
    for (const w of walk(doc))
        if (w.node.link)
            n++;
    return n;
}
function route(doc, all, bands, bandOf, tops, baseFrame, extraFrame, outer, columnXs) {
    // The gaps on each side of each frame, within its band.
    const leftGap = new Map();
    const rightGap = new Map();
    // A gap is between two columns of a group, or between two groups, so it is clear for the whole
    // height of the band.
    bands.forEach((groups, band) => {
        let prevGroupRight = 0;
        groups.forEach((g, gi) => {
            const left = g[0]?.[0]?.x ?? 0;
            const cols = columnXs(g);
            const n = cols.length - 1;
            const colLeft = (j) => left + (cols[j] ?? 0);
            const colRight = (j) => (j + 1 < n ? colLeft(j + 1) - H_GAP : left + (cols[n] ?? 0));
            const groupRight = colRight(n - 1);
            const nextGroupLeft = groups[gi + 1]?.[0]?.[0]?.x ?? groupRight + H_GAP;
            for (const row of g) {
                row.forEach((f, j) => {
                    leftGap.set(f, { band, a: j > 0 ? colRight(j - 1) : prevGroupRight, b: colLeft(j) });
                    rightGap.set(f, { band, a: colRight(j), b: j + 1 < n ? colLeft(j + 1) : nextGroupLeft });
                });
            }
            prevGroupRight = groupRight;
        });
    });
    const plans = [];
    for (const w of all) {
        const n = w.node;
        if (!n.link)
            continue;
        const overlay = ancestorOverlay(n, w.screen);
        const from = overlay
            ? overlay.flags?.includes('open')
                ? baseFrame.get(w.screen)
                : extraFrame.get(overlay)
            : baseFrame.get(w.screen);
        const target = all.find((t) => t.node.id === n.link?.to)?.node;
        if (!from || !target)
            continue;
        let to;
        if (OVERLAYS.has(target.type)) {
            if (target.flags?.includes('open'))
                continue; // a link to an open overlay is not drawn
            to = extraFrame.get(target);
        }
        else {
            to = baseFrame.get(target);
        }
        if (!to || to === from)
            continue;
        const el = (from.overlay && overlay ? collect(from.overlay) : frameElements(from)).find((l) => l.node === n);
        if (!el)
            continue;
        const plan = { from, to, start: el.box };
        if (n.link.label !== undefined)
            plan.label = n.link.label;
        plans.push(plan);
    }
    for (const f of doc.flows ?? []) {
        const fs = doc.screens.find((s) => s.id === f.from);
        const ts = doc.screens.find((s) => s.id === f.to);
        const from = fs ? baseFrame.get(fs) : undefined;
        const to = ts ? baseFrame.get(ts) : undefined;
        if (!from || !to || from === to)
            continue;
        const plan = { from, to };
        if (f.label !== undefined)
            plan.label = f.label;
        plans.push(plan);
    }
    // First pass: which gaps each arrow uses.
    // Gaps in different bands are different gaps, even where their x-ranges line up. The left
    // margin is one gap for the whole canvas: arrows between bands run in it too.
    const MARGIN_GAP = { band: -1, a: 0, b: MARGIN };
    const key = (g) => (g.a === 0 ? 'margin' : `${g.band}:${g.a}:${g.b}`);
    const usage = new Map();
    const take = (g) => {
        const k = (usage.get(key(g)) ?? 0) + 1;
        usage.set(key(g), k);
        return k;
    };
    // An arrow to a band more than one band below, or to any band above, leaves its own band by
    // the lane next to it, runs along the left margin, and joins the lane above the target's band.
    const viaMargin = (S, T) => {
        const bs = bandOf.get(S) ?? 0;
        const bt = bandOf.get(T) ?? 0;
        return bt < bs || bt > bs + 1;
    };
    const routes = plans.map((p) => {
        const S = p.from;
        const T = p.to;
        let dir;
        let overlap = false;
        if (T.x >= S.x + outer(S))
            dir = 'right';
        else if (T.x + outer(T) <= S.x)
            dir = 'left';
        else {
            dir = 'left';
            overlap = true;
        }
        const gs = (dir === 'right' ? rightGap.get(S) : leftGap.get(S));
        const gt = (dir === 'right' || overlap ? leftGap.get(T) : rightGap.get(T));
        // An arrow with a label always runs through a lane, and its label sits on the lane, where it
        // can't cover a frame.
        const labelled = p.label !== undefined && p.label !== '';
        const same = key(gs) === key(gt) && !labelled;
        const slotS = take(gs);
        const slotT = same ? slotS : take(gt);
        const slotM = !same && viaMargin(S, T) ? take(MARGIN_GAP) : 0;
        return { p, dir, overlap, gs, gt, same, labelled, slotS, slotT, slotM };
    });
    // Lanes run above a band, numbered per band in link order.
    const lanes = bands.map(() => 0);
    const lane = (b, labelled = false) => {
        lanes[b] = (lanes[b] ?? 0) + (labelled ? LABELLED_LANE : LANE);
        return r((tops[b] ?? 0) - TITLE - (lanes[b] ?? 0));
    };
    const arrows = routes.map((rt) => {
        const { p, dir, overlap, gs, gt, same, labelled } = rt;
        const S = p.from;
        const T = p.to;
        const xIn = (g, k) => r(g.a + ((g.b - g.a) * k) / ((usage.get(key(g)) ?? 1) + 1));
        let start;
        if (p.start) {
            const b = p.start;
            start = [r(S.x + (dir === 'right' ? b.x + b.w : b.x)), r(S.y + b.y + b.h / 2)];
        }
        else {
            start = [r(dir === 'right' ? S.x + S.w : S.x), r(S.y + S.h / 2)];
        }
        const entryY = r(T.y + 48);
        const entryX = r(dir === 'right' || overlap ? T.x : T.x + T.w);
        const xs = xIn(gs, rt.slotS);
        let points;
        let mid;
        if (same) {
            points = [start, [xs, start[1]], [xs, entryY], [entryX, entryY]];
        }
        else if (rt.slotM === 0) {
            const laneY = lane(bandOf.get(T) ?? 0, labelled);
            const xt = xIn(gt, rt.slotT);
            if (labelled)
                mid = [r((xs + xt) / 2), laneY];
            points = [start, [xs, start[1]], [xs, laneY], [xt, laneY], [xt, entryY], [entryX, entryY]];
        }
        else {
            const bs = bandOf.get(S) ?? 0;
            const bt = bandOf.get(T) ?? 0;
            const outY = lane(bt < bs ? bs : bs + 1);
            const xm = xIn(MARGIN_GAP, rt.slotM);
            const inY = lane(bt, labelled);
            const xt = xIn(gt, rt.slotT);
            if (labelled)
                mid = [r((xm + xt) / 2), inY];
            points = [
                start,
                [xs, start[1]],
                [xs, outY],
                [xm, outY],
                [xm, inY],
                [xt, inY],
                [xt, entryY],
                [entryX, entryY],
            ];
        }
        points = points.filter((pt, i) => i === 0 || pt[0] !== points[i - 1]?.[0] || pt[1] !== points[i - 1]?.[1]);
        const arrow = { points, mid: mid ?? midpoint(points) };
        if (p.label !== undefined)
            arrow.label = p.label;
        return arrow;
    });
    return { arrows, lanes };
}
function ancestorOverlay(n, screen) {
    for (const o of screen.children ?? []) {
        if (!OVERLAYS.has(o.type))
            continue;
        if (contains(o, n))
            return o;
    }
    return undefined;
}
function contains(a, b) {
    if (a === b)
        return true;
    return (a.children ?? []).some((c) => contains(c, b));
}
/** The point halfway along a path of straight segments. */
export function midpoint(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++)
        total += seg(points[i - 1], points[i]);
    let left = total / 2;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const d = seg(a, b);
        if (left <= d && d > 0) {
            const t = left / d;
            return [r(a[0] + (b[0] - a[0]) * t), r(a[1] + (b[1] - a[1]) * t)];
        }
        left -= d;
    }
    return points[0] ?? [0, 0];
}
function seg(a, b) {
    if (!a || !b)
        return 0;
    return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
}
//# sourceMappingURL=overview.js.map