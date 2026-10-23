# Suncatcher Maker

Turns any SVG into a laser-cut suncatcher, stacked as **front design · frame (holds the glass) · back design**.

Open `index.html` in a browser. It works offline, with no build step and no server.

## How it works

1. **Artwork**: drop in an SVG. The app reads it one of two ways:
   - **Silhouette**: filled shapes (clip art) become wood. White shapes cut away, and strokes count as wood.
   - **Cut lines**: closed contours become openings, like a laser file such as the butterfly demo.
   - **Auto** picks one for you. **Invert** swaps wood and openings.
2. **Shape & size**: rounded rectangle, circle/ellipse, arch, hexagon or octagon, in any size.
3. **Borders & glass**: the glass sits in the frame window. Front and back hold it in place, overlapping it by *design border − frame border*.
4. **Hanger**: none, one loop or two loops on the frame. The design layers get matching notches.
5. **Download SVG**: red lines are cuts (mm units, works in xTool Creative Space / LightBurn). Blue is the optional glass template.

The laser-layout view marks loose pieces (red) and spots thinner than the minimum wood width (orange).
Defaults match the original `tc_vlinders_test10.svg`: 120 × 120 mm, 10 mm design border, 7.5 mm frame border, two Ø10 mm holes 69.5 mm apart.

`clipper.js` is [Clipper](http://www.angusj.com/delphi/clipper.php) 6.4.2 (Boost Software License). It handles polygon booleans and offsets.
