# Pin Jig Generator

A browser app for batch UV-printing 3D-printed enamel-style pins on the **xTool Omni small plate**. It follows the workflow from [this video](https://www.youtube.com/watch?v=mVD4C-Y-ly8) and removes the manual steps in xTool Creative Space and Bambu Studio.

Open `index.html` in a browser. There is no build step and no server, and it works offline.

## What it makes

| Download | What it is |
| --- | --- |
| **Jig STL** | A 165 × 122 × 2.5 mm plate with 0.5 mm deep pockets shaped like your pin, plus 0.2 mm clearance. Print it **twice**. Two jigs fill the 330 × 122 mm print area of the small plate. |
| **UV layout PNG** | Your artwork placed at every pocket position, for both jigs, on a transparent 330 × 122 mm canvas with the DPI embedded. Import it in xTool Creative Space at X 0, Y 0. |
| **UV layout SVG** | The same layout as a millimetre-accurate SVG. |
| **Pocket shapes SVG** | The pocket outlines only, if you'd rather cut the jig yourself in a slicer as a negative part, the way the video does. |

The frame that holds the jigs on the plate isn't generated here.

## Inputs

1. **Pin outline.** Choose one source:
   - **From image:** the PNG/JPG you also put into MakerWorld's image-to-keychain, plus the same pin width (default 30 mm). The app traces the outer silhouette and ignores inner gaps, like the "outer shapes only" offset in the video.
   - **From MakerWorld model:** the 3MF or STL of a single pin exported from image-to-keychain. The model's real footprint becomes the pocket, so pockets and pins match exactly.
2. **Print artwork (optional).** The coloured design, usually without the black border. It's centred on each pin. Its width is taken from the file's DPI (for example a 300 dpi export at final size); if the file has no usable DPI, it falls back to the pin width. You can override the width and nudge X/Y. If you skip this, the pin image itself is printed.
3. **Jig.** Size, thickness, pocket depth, clearance, minimum wall, and an orientation chamfer on the top-left corner. The chamfer keeps the jig and the print from ending up rotated 180°.
4. **Layout.** It auto-fits as many pins as possible with a set gap. A 30 mm pin with a 2 mm gap gives 5 × 3 at 32 mm spacing, which is 15 per jig and 30 per plate, the same as the video. You can also set columns, rows and spacing yourself. Pockets that overlap or come too close to the edge are flagged.

## Coordinates

- Jig 1 is the left half (X 0–165) and jig 2 the right half (X 165–330), matching the two 165 × 122 rectangles in the video.
- The top of the preview and of the PNG is the back of the plate, as in xTool Creative Space.
- The chamfered corner of each jig goes at the back-left.
- The STL is in millimetres with the pockets facing up, ready to slice.

## Development

```
pin-jig/
  index.html, styles.css
  js/geom.js          polygon helpers (Clipper): union, offset, simplify
  js/trace.js         image -> mask -> marching squares outline
  js/model-import.js  STL / 3MF reader (with a small zip reader) -> footprint
  js/jig-mesh.js      watertight jig mesh + binary STL writer
  js/layout.js        grid, validation, UV layout PNG/SVG export
  js/app.js           UI
  vendor/             clipper-lib 6.4.2 (Boost licence), earcut 2.2.4 (ISC)
  tests/core.test.js
```

Run the tests with Node 18 or newer:

```
node --test pin-jig/tests/*.test.js
```
