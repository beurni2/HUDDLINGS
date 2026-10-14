"""Cut-out silhouettes of the drawn dog (spec section 5b, phase 2): "a flood fill
from the page colour with the outline as the wall".

The sheets' cream fur is nearly the colour of the card behind it and their
outline fades to almost nothing at the fluffy top of the head, so a plain fill
leaks. The cut-out is made in three steps:
1. A fill from the crop's border through pixels that are not outline (warm and
   darker than the card) and are either within a colour tolerance of the card
   or neutral like the ground shadow. Whatever it cannot reach is the drawing.
   A loose tolerance clears the rim of JPEG noise around the drawing but can
   leak through a faint outline into fur of nearly the card's colour, so each
   figure takes the loosest of TOLERANCES whose cut-out keeps at least KEEP of
   the strictest one's area: a leak loses far more.
2. A watershed between sure background (that fill, plus the neutral ground
   shadow in the bottom of the figure) and sure drawing (step 1 eroded, never a
   card-coloured pixel), on an elevation that peaks on the outline, puts the edge
   on the outline itself. Outline pieces that touch the result (a nose on the
   edge of a profile) join it; near the ground only dark ones, since the warm
   shadow beside the paws would pass for faint outline.
3. In the ground band, whatever lies below the lowest dark outline of its
   column is the warm shadow under the paws, and is cut.
"""
import numpy as np
from scipy import ndimage
from skimage.segmentation import watershed

import sheets

TOLERANCES = (3.5, 3.0, 2.5, 2.0)
KEEP = 0.94
CARD_SEED = 1.5
ERODE = 5
GROUND_BAND = 0.15


def _largest(mask):
    labels, count = ndimage.label(mask)
    if count == 0:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == (int(np.argmax(sizes)) + 1)


def cut_out(rgb):
    """The drawing's silhouette in a crop of one figure on a plain card: a boolean mask."""
    lab = sheets.to_lab(rgb)
    L, C = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    edge = np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    card = np.median(edge, axis=0)
    distance = sheets.delta_e2000(lab, card[None, None, :])
    wall = ((L < 93) & (C > 11)) | (L < 82)
    shadowlike = (C < 8.5) & (L > 78) & (L < 95)

    def fill(tolerance):
        labels, _ = ndimage.label(~wall & ((distance < tolerance) | shadowlike))
        outside = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
        return _largest(ndimage.binary_fill_holes(~np.isin(labels, list(outside))))

    strict = fill(TOLERANCES[-1])
    rough = next(found for found in map(fill, TOLERANCES) if found.sum() >= KEEP * strict.sum())
    sure_drawing = ndimage.binary_erosion(rough, np.ones((3, 3), bool), iterations=ERODE) & (distance >= CARD_SEED)
    rows = np.nonzero(rough)[0]
    low = np.zeros(rough.shape, bool)
    low[int(rows.min() + 0.82 * (rows.max() - rows.min())):, :] = True
    shadow = shadowlike & low & (C < 7) & ~sure_drawing
    markers = np.zeros(rough.shape, np.int32)
    markers[~rough | shadow] = 1
    markers[sure_drawing] = 2
    found = watershed((100 - L) + 0.5 * C, markers) == 2
    # Outline pieces inside the rough cut-out that touch the result belong to it whole. Near the ground
    # only the dark line counts: the ground shadow beside the paws is warm enough to pass for faint outline.
    pieces, _ = ndimage.label(np.where(low, L < 82, wall) & rough & ~shadow, np.ones((3, 3), bool))
    touching = np.unique(pieces[ndimage.binary_dilation(found) & (pieces > 0)])
    found |= np.isin(pieces, touching[touching > 0])
    found = _largest(ndimage.binary_fill_holes(found))
    # The warm shadow right under the paws: below each column's lowest dark outline, in the ground band.
    rows = np.nonzero(found)[0]
    band_top = int(rows.max() - GROUND_BAND * (rows.max() - rows.min()))
    dark = (L < 70) & found
    for column in range(found.shape[1]):
        lows = np.nonzero(dark[band_top:, column])[0]
        if len(lows):
            found[band_top + lows.max() + 2:, column] = False
    return _largest(found)
