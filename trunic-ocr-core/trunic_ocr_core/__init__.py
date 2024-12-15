import gc
import math
import typing
from dataclasses import dataclass

import cv2
import numpy as np
import numpy.typing as npt

type NDArray_u8 = npt.NDArray[np.uint8]
type NDArray_i32 = npt.NDArray[np.int32]
type NDArray_f32 = npt.NDArray[np.float32]
type NDArray_f64 = npt.NDArray[np.float64]
type SegCoordArrI = npt.NDArray[np.uint32]
type SegCoordArrF = npt.NDArray[np.float64]


def decodeImage(imgData: memoryview) -> NDArray_u8:
    return cv2.imdecode(np.asarray(imgData), cv2.IMREAD_COLOR)


# assumes input is from `decodeImage`
def image2Rgba(img: NDArray_u8) -> NDArray_u8:
    if len(img.shape) == 3:
        return np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGBA))
    else:
        return np.ascontiguousarray(cv2.cvtColor(img * 255, cv2.COLOR_GRAY2RGBA))


def loadBitmap(bmpData: memoryview, width: int, height: int) -> NDArray_u8:
    return np.asarray(bmpData).reshape(height, width, 4)


def oneshotRecognize(src_raw: NDArray_u8):
    src, upscale = preprocess(src_raw)
    yield 1
    strokes_raw = segmentThreshold(src, upscale)
    del src
    yield 2
    medialAxis, medialAxisMask = mkMedialAxis(strokes_raw)
    yield 3
    stroke_width = findStrokeWidth(medialAxis)
    yield 4
    strokes = clean_strokes(strokes_raw, medialAxis, stroke_width)
    del strokes_raw
    del medialAxis
    strokes_f = np.float32(strokes)
    yield 5
    baselines, baselines_spec = find_baselines(upscale, stroke_width, strokes_f)
    yield 6
    stroke_angle = find_stroke_angle(medialAxisMask, strokes)
    del medialAxisMask
    yield 7
    segments_raw_vert, segment_coords_raw_vert = find_vertical_segments(
        upscale, stroke_width, strokes, strokes_f, baselines
    )
    yield 8
    (
        segments_raw_slant_p,
        segment_coords_raw_slant_p,
        segments_raw_slant_n,
        segment_coords_raw_slant_n,
    ) = find_slanted_segments(upscale, stroke_width, strokes, strokes_f, stroke_angle)
    yield 9
    all_segments_raw = segments_raw_vert | segments_raw_slant_p | segments_raw_slant_n
    del segments_raw_vert
    del segments_raw_slant_p
    del segments_raw_slant_n
    yield 10
    approx_glyph_height = find_approx_glyph_height(strokes, baselines, all_segments_raw)
    del strokes
    del baselines
    del all_segments_raw
    yield 11
    all_endpoints = np.concatenate(
        (
            *segment_coords_raw_vert,
            *segment_coords_raw_slant_p,
            *segment_coords_raw_slant_n,
        ),
        axis=1,
    )
    grid1, grid2, offset_u, offset_l = find_geometry(
        upscale,
        stroke_width,
        baselines_spec,
        stroke_angle,
        segment_coords_raw_vert,
        approx_glyph_height,
        all_endpoints,
    )
    del all_endpoints
    del segment_coords_raw_vert
    del segment_coords_raw_slant_p
    del segment_coords_raw_slant_n
    yield 12

    glyph_width = grid1[0] * 2
    glyph_height = offset_l[1] - offset_u[1] + grid2[1] * 2
    glyph_template_shape = (
        math.ceil(glyph_height) + 3 * stroke_width + upscale * 2,
        math.ceil(glyph_width) + stroke_width + upscale * 2,
    )
    glyph_template_origin = np.array(
        [
            stroke_width // 2 + upscale,
            -offset_u[1] + grid2[1] + stroke_width // 2 + upscale,
        ],
        dtype=np.int32,
    )

    all_lines, circle_center = make_all_lines(
        stroke_width,
        grid1,
        grid2,
        offset_u,
        offset_l,
        glyph_width,
        glyph_template_origin,
    )
    del grid1
    del grid2
    del offset_u
    del offset_l

    glyph_geometry_pod = GlyphGeometry(
        upscale=upscale,
        stroke_width=stroke_width,
        glyph_width=glyph_width,
        glyph_template_shape=glyph_template_shape,
        glyph_template_origin=glyph_template_origin,
        all_lines=all_lines,
        circle_center=circle_center,
    ).to_pod()
    del (
        upscale,
        stroke_width,
        glyph_template_shape,
        glyph_template_origin,
        all_lines,
        circle_center,
    )

    yield 13, glyph_geometry_pod

    glyph_origins_raw = np.array(
        [
            [round(bsln_spec.x + i * glyph_width), bsln_spec.y]
            for bsln_spec in baselines_spec
            for i in range(round(bsln_spec.length / glyph_width))
        ],
        dtype=np.int32,
    )
    del baselines_spec
    del glyph_width

    glyph_geometry = GlyphGeometry.from_pod(glyph_geometry_pod)

    glyph_template, glyph_template_mask, glyph_template_base = make_template(
        glyph_geometry
    )

    upscale = glyph_geometry.upscale
    stroke_width = glyph_geometry.stroke_width
    glyph_template_shape = glyph_geometry.glyph_template_shape
    glyph_template_origin = glyph_geometry.glyph_template_origin
    del glyph_geometry

    gc.collect()
    glyphs_strokes, glyphs_origins = yield from fit_glyphs(
        upscale,
        stroke_width,
        strokes_f,
        glyph_template_shape,
        glyph_template_origin,
        glyph_template,
        glyph_template_mask,
        glyph_template_base,
        glyph_origins_raw,
    )

    consonants, vowels_circ = np.split(glyphs_strokes, [6], axis=1)
    glyphs_strokes_packed = np.concatenate(
        [
            np.packbits(consonants, axis=1, bitorder="little"),
            np.packbits(vowels_circ, axis=1, bitorder="little"),
        ],
        axis=1,
    )

    return (
        np.ascontiguousarray(glyphs_strokes_packed),
        np.ascontiguousarray(glyphs_origins - glyph_template_origin),
    )


def preprocess(img: NDArray_u8, upscale=3) -> tuple[NDArray_u8, int]:
    isBgr = img.shape[2] == 3
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY if isBgr else cv2.COLOR_RGBA2GRAY)
    ret = cv2.resize(gray, None, None, upscale, upscale, cv2.INTER_CUBIC)
    return (ret, upscale)


def segmentThreshold(
    src: NDArray_u8, upscale: int, blur=1, athresh_range_pct=30, athres_val=30
) -> NDArray_u8:
    blurred = cv2.GaussianBlur(src, (blur * 2 + 1, blur * 2 + 1), 0)
    thresh_block_size = (
        round(min(blurred.shape[0], blurred.shape[1]) * athresh_range_pct / 200) * 2 + 1
    )
    # equivalent to `cv2.adaptiveThreshold`
    img_mean = np.int16(
        cv2.GaussianBlur(
            np.float32(blurred),
            (thresh_block_size, thresh_block_size),
            0,
            borderType=(cv2.BORDER_REPLICATE | cv2.BORDER_ISOLATED),
        )
        + 0.5
    )
    diff = blurred - img_mean
    thresh = np.uint8(diff <= -athres_val)
    thresh_inv = np.uint8(diff >= athres_val)

    avg_foregnd = np.mean(blurred[thresh > 0])
    avg_foregnd_inv = np.mean(blurred[thresh_inv > 0])
    border_avg = np.mean(np.concatenate([*blurred[:, [0, -1]], *blurred[[0, -1], :]]))
    ret = (
        thresh_inv
        if abs(border_avg - avg_foregnd_inv) > abs(border_avg - avg_foregnd)
        else thresh
    )
    ret = cv2.morphologyEx(ret, cv2.MORPH_OPEN, mk_rect(upscale, upscale))
    return ret


def mkMedialAxis(
    strokes_raw: NDArray_u8, laplacian_thresh=3.5
) -> tuple[NDArray_f32, NDArray_u8]:
    distTrans = cv2.distanceTransform(strokes_raw, cv2.DIST_L2, 5, dstType=cv2.CV_32F)
    distTransLp = cv2.Laplacian(distTrans, -1, ksize=3, scale=-1)
    _t, medialAxisMask = cv2.threshold(
        distTransLp, laplacian_thresh, 1, cv2.THRESH_BINARY
    )
    medialAxis = distTrans * medialAxisMask
    return (medialAxis, np.uint8(medialAxisMask))


def findStrokeWidth(medialAxis: NDArray_f32) -> int:
    stroke_h_width_max = math.ceil(np.max(medialAxis))
    hist, _hist_edges = np.histogram(
        medialAxis, (stroke_h_width_max - 1) * 2, (1.75, stroke_h_width_max + 0.75)
    )
    return int(np.argmax(hist) + 4)


def clean_strokes(
    strokes_raw: NDArray_u8,
    medialAxis: NDArray_f32,
    stroke_width: int,
    area_ratio_min=2.0,
    stroke_filt_tol=4.0,
    stroke_filt_thresh_pct=65,
) -> NDArray_u8:
    n_comp, cc_labels, cc_stats, _c = cv2.connectedComponentsWithStats(
        strokes_raw, connectivity=4, ltype=cv2.CV_16U
    )

    strokes_clean = strokes_raw.copy()
    for i in range(1, n_comp):
        roi = cv2_cc_get_roi(cc_stats, i)
        if cc_stats[i, cv2.CC_STAT_AREA] < stroke_width * stroke_width * area_ratio_min:
            strokes_clean[roi][cc_labels[roi] == i] = 0
            continue
        comp_medial_axis = medialAxis[roi] * (cc_labels[roi] == i)
        ma_px_count_total = np.count_nonzero(comp_medial_axis)
        lo = (stroke_width - stroke_filt_tol) / 2
        hi = (stroke_width + stroke_filt_tol) / 2
        ma_px_count_range = np.count_nonzero(
            (lo <= comp_medial_axis) & (comp_medial_axis <= hi)
        )
        if ma_px_count_range / ma_px_count_total < stroke_filt_thresh_pct / 100:
            strokes_clean[roi][cc_labels[roi] == i] = 0
            continue
    return strokes_clean


@dataclass
class BaselineSpec:
    x: int
    y: int
    length: int

    def as_roi(self):
        return (slice(self.y, self.y + 1), slice(self.x, self.x + self.length))


def find_baselines(
    upscale: int,
    stroke_width: int,
    strokes_f: NDArray_f32,
    min_aspect_ratio=3.5,
    filter_thresh_pct=90,
) -> tuple[NDArray_u8, NDArray_u8, list[BaselineSpec]]:
    line_min_len = round(stroke_width * min_aspect_ratio)
    kernel_x = np.ones(line_min_len, dtype=np.float32)
    kernel_y = np.array(
        [0] * (stroke_width // 2)
        + [1] * stroke_width
        + [0]
        + [-2] * (stroke_width // 2 - 1),
        dtype=np.float32,
    )
    bslns_lower_edge = cv2.sepFilter2D(
        strokes_f,
        -1,
        kernel_x,
        kernel_y,
        anchor=((kernel_x.size - 1) // 2, (kernel_y.size - 1) // 2),
    )
    _v, bslns_lower_edge = cv2.threshold(
        bslns_lower_edge,
        stroke_width * line_min_len * filter_thresh_pct / 100,
        1,
        cv2.THRESH_BINARY,
    )
    bslns_lower_edge = np.uint8(bslns_lower_edge)

    kernel_x = np.ones(upscale, dtype=np.float32)
    kernel_y = np.array(
        [-2] * (stroke_width // 2 - 1)
        + [0]
        + [1] * stroke_width
        + [0]
        + [-2] * (stroke_width // 2 - 1),
        dtype=np.float32,
    )
    bslns_both_edge = cv2.sepFilter2D(
        strokes_f,
        -1,
        kernel_x,
        kernel_y,
        anchor=((kernel_x.size - 1) // 2, (kernel_y.size - 1) // 2),
    )
    _v, bslns_both_edge = cv2.threshold(
        bslns_both_edge,
        stroke_width * upscale * filter_thresh_pct / 100,
        1,
        cv2.THRESH_BINARY,
    )
    bslns_both_edge = np.uint8(bslns_both_edge)
    bslns_lower_edge &= cv2.dilate(bslns_both_edge, mk_rect(2 * stroke_width, 3))

    bslns_lower_edge_dil = cv2.dilate(bslns_lower_edge, mk_rect(line_min_len, 3))
    bslns_lower_edge_dil = cv2.morphologyEx(
        bslns_lower_edge_dil, cv2.MORPH_CLOSE, mk_rect(stroke_width, 1)
    )

    bslns_seed = np.zeros(strokes_f.shape, dtype=np.uint8)
    n_cc, cc_labels, cc_stats, _c = cv2.connectedComponentsWithStats(
        bslns_lower_edge_dil
    )
    baselines_spec = []
    for i in range(1, n_cc):
        roi = cv2_cc_get_roi(cc_stats, i)
        cc_mask = cc_labels[roi] == i
        summed_l = np.sum(bslns_lower_edge[roi] & cc_mask, axis=1, dtype=np.uint32)
        summed_u = np.sum(bslns_both_edge[roi] & cc_mask, axis=1, dtype=np.uint32)
        line_y = np.argmax(summed_l + 3 * summed_u)

        spec = BaselineSpec(
            roi[1].start + 1 + math.floor((stroke_width - 1) / 2),
            roi[0].start + line_y,
            cc_stats[i, cv2.CC_STAT_WIDTH] - 1 - stroke_width,
        )
        baselines_spec.append(spec)
        bslns_seed[spec.as_roi()] = 1

    baselines = cv2.dilate(bslns_seed, mk_circle(stroke_width))
    return baselines, baselines_spec


def find_stroke_angle(
    medialAxisMask: NDArray_u8, strokes: NDArray_u8, hough_thresh=15
) -> int:
    # also works fine with just `medialAxisMask`, but this looks cleaner
    lines = cv2.HoughLinesP(
        medialAxisMask * strokes,
        1,
        math.pi / 180,
        hough_thresh,
        minLineLength=0,
        maxLineGap=3,
    )
    x1, y1, x2, y2 = lines.reshape((-1, 4)).transpose()
    dx = x2 - x1
    dy = y2 - y1
    lens = np.hypot(dx, dy)
    angles = np.int8(
        np.round(np.arctan2(dy, dx) * (36 / math.pi))
    )  # round to nearest 5 degrees
    angles = np.abs(angles)
    angles[angles > 18] -= 36
    angles = np.abs(angles)
    angles_hist, _angles_hist_edges = np.histogram(
        angles, 19, (-0.5, 18.5), weights=lens
    )
    stroke_angle_i = np.argmax(angles_hist[3:-3]) + 3
    stroke_angle = stroke_angle_i * 5
    return stroke_angle


def find_vertical_segments_gen(
    upscale: int,
    stroke_width: int,
    strokes: NDArray_u8,
    strokes_f: NDArray_f32,
    min_aspect_ratio: float,
    filter_area_thresh_pct: float,
    filter_edge_thresh_pct: float,
    bridge_zone: NDArray_u8 | None = None,
) -> tuple[NDArray_u8, SegCoordArrI]:
    segment_min_len = round(stroke_width * min_aspect_ratio)
    img_fill_filt = cv2.boxFilter(
        strokes_f,
        -1,
        (stroke_width, segment_min_len),
        anchor=((stroke_width - 1) // 2, (segment_min_len - 1) // 2),
        normalize=False,
    )
    seeds = np.uint8(
        img_fill_filt >= stroke_width * segment_min_len * filter_area_thresh_pct / 100
    )
    seeds = cv2.dilate(seeds, mk_rect(1, segment_min_len))
    seeds &= strokes

    kxcw = stroke_width - 2
    kernel_x = np.array(
        [-kxcw / 2, 0, 0] + [1] * kxcw + [0, 0, -kxcw / 2], dtype=np.float32
    )
    kernel_y = np.ones(upscale, dtype=np.float32)
    img_edge_filt = cv2.sepFilter2D(
        strokes_f,
        -1,
        kernel_x,
        kernel_y,
        anchor=((kernel_x.size - 1) // 2, (kernel_y.size - 1) // 2),
    )
    seeds_edge = np.uint8(
        img_edge_filt >= filter_edge_thresh_pct / 100 * kxcw * upscale
    )
    seeds &= cv2.dilate(seeds_edge, mk_rect(1, 3 * stroke_width))
    seeds &= cv2.erode(np.uint8(img_edge_filt >= 0), mk_rect(1, upscale))

    if bridge_zone is not None:
        bridge_close = cv2.morphologyEx(
            seeds, cv2.MORPH_CLOSE, mk_rect(3, 3 * stroke_width)
        )
        seeds |= bridge_close & bridge_zone
        seeds = cv2.morphologyEx(
            seeds, cv2.MORPH_OPEN, mk_rect(1, 3 * stroke_width + segment_min_len)
        )
    else:
        seeds = cv2.morphologyEx(seeds, cv2.MORPH_OPEN, mk_rect(1, segment_min_len))

    seeds_clean = np.zeros(strokes_f.shape, dtype=np.uint8)
    n_cc, cc_labels, cc_stats, _c = cv2.connectedComponentsWithStats(
        cv2.dilate(seeds, mk_rect(3, 3))
    )
    coords = np.zeros((2, 2, n_cc - 1), dtype=np.uint32)
    for i in range(1, n_cc):
        roi = cv2_cc_get_roi(cc_stats, i)
        cc_mask = cc_labels[roi] == i
        summed_f = np.sum(img_fill_filt[roi] * cc_mask, axis=0)
        summed_e = np.sum(img_edge_filt[roi] * cc_mask, axis=0)
        line_x = np.argmax(summed_f + 3 * (segment_min_len / upscale) * summed_e)

        x = roi[1].start + line_x
        y = roi[0].start + 1 + math.floor((stroke_width - 1) / 2)
        height = cc_stats[i, cv2.CC_STAT_HEIGHT] - 1 - stroke_width
        seeds_clean[y : y + height, x] = 1
        coords[:, 0, i - 1] = x
        coords[0, 1, i - 1] = y
        coords[1, 1, i - 1] = y + height - 1

    return seeds_clean, coords


def find_vertical_segments(
    upscale: int,
    stroke_width: int,
    strokes: NDArray_u8,
    strokes_f: NDArray_f32,
    baselines: NDArray_u8,
    min_aspect_ratio=2.0,
    filter_area_thresh_pct=75,
    filter_edge_thresh_pct=70,
) -> tuple[NDArray_u8, SegCoordArrI]:
    bridge_zone = cv2.dilate(
        baselines, mk_rect(1, stroke_width * 2), anchor=(0, stroke_width * 2 - 1)
    )
    seeds_clean, coords = find_vertical_segments_gen(
        upscale,
        stroke_width,
        strokes,
        strokes_f,
        min_aspect_ratio,
        filter_area_thresh_pct,
        filter_edge_thresh_pct,
        bridge_zone,
    )
    vertical_segments = cv2.dilate(seeds_clean, mk_circle(stroke_width))

    return vertical_segments, coords


def find_slanted_segments(
    upscale: int,
    stroke_width: int,
    strokes: NDArray_u8,
    strokes_f: NDArray_f32,
    stroke_angle: float,
    min_aspect_ratio=2.5,
    filter_area_thresh_pct=80,
    filter_edge_thresh_pct=90,
) -> tuple[NDArray_u8, SegCoordArrF, NDArray_u8, SegCoordArrF]:
    width = strokes.shape[1]
    height = strokes.shape[0]

    def do_one(angle):
        angle_abs_r = abs(angle * math.pi / 180)
        mat = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1)
        new_width = math.ceil(
            width * math.cos(angle_abs_r) + height * math.sin(angle_abs_r)
        )
        new_height = math.ceil(
            height * math.cos(angle_abs_r) + width * math.sin(angle_abs_r)
        )
        mat[0, 2] += (new_width - width) / 2
        mat[1, 2] += (new_height - height) / 2
        strokes_rot = cv2.warpAffine(
            strokes_f, mat, (new_width, new_height), flags=cv2.INTER_LINEAR
        )

        seeds_clean_rot, coords_rot = find_vertical_segments_gen(
            upscale,
            stroke_width,
            np.uint8(strokes_rot != 0),
            strokes_rot,
            min_aspect_ratio,
            filter_area_thresh_pct,
            filter_edge_thresh_pct,
        )

        segs_rot = cv2.dilate(seeds_clean_rot, mk_circle(stroke_width))
        segs_unrot = cv2.warpAffine(
            segs_rot,
            mat,
            (width, height),
            flags=(cv2.WARP_INVERSE_MAP | cv2.INTER_NEAREST),
        )
        coords_unrot = np.matmul(
            np.linalg.inv(np.vstack((mat, np.array([0, 0, 1])))),
            np.insert(coords_rot, 2, 1, axis=1),
        )
        return segs_unrot, np.delete(coords_unrot, 2, axis=1)

    segs_pos, coords_pos = do_one(90 - stroke_angle)
    segs_neg, coords_neg = do_one(stroke_angle - 90)
    return segs_pos, coords_pos, segs_neg, coords_neg


def find_approx_glyph_height(
    strokes: NDArray_u8,
    baselines: NDArray_u8,
    all_segments_raw: NDArray_u8,
    percentile=95,
) -> int:
    dist_baseline = np.uint32(cv2.distanceTransform(1 - baselines, cv2.DIST_C, 3))

    strokes_notbl = strokes & all_segments_raw

    _dist_nbs, nbs_vrnoi = cv2.distanceTransformWithLabels(
        1 - strokes_notbl, cv2.DIST_C, 3
    )

    dist_bline_ccmax = np.zeros(strokes.shape)
    for i in range(np.min(nbs_vrnoi), np.max(nbs_vrnoi) + 1):
        vrnoi_mask_raw = nbs_vrnoi == i
        roi = cv_rect_to_roi(cv2.boundingRect(np.uint8(vrnoi_mask_raw)))
        vrnoi_mask = vrnoi_mask_raw[roi]
        dist_bline_ccmax[roi][vrnoi_mask] = np.max(
            dist_baseline[roi][vrnoi_mask & (strokes_notbl[roi] != 0)]
        )
    dists = dist_bline_ccmax[baselines != 0]

    dists_min, ret, dists_max = np.int32(np.percentile(dists, [0, percentile, 100]))

    return ret


def find_geometry(
    upscale: int,
    stroke_width: int,
    baselines_spec: list[BaselineSpec],
    stroke_angle: int,
    segment_coords_raw_vert: SegCoordArrI,
    approx_glyph_height: int,
    all_endpoints: npt.NDArray[np.uint32],
    samples_per_check=50,
) -> tuple[NDArray_f32, NDArray_f32, NDArray_f32, NDArray_f32]:
    def filter_in_baseline(
        all_endpoints: npt.NDArray[np.uint32], bsln_spec: BaselineSpec
    ):
        hsw0 = math.floor((stroke_width - 1) / 2)
        hsw1 = math.floor(stroke_width / 2)
        xmin = bsln_spec.x - hsw0 - upscale
        xmax = bsln_spec.x + hsw1 + upscale + bsln_spec.length
        ymin_u = bsln_spec.y - hsw0 - upscale - approx_glyph_height
        ymax_l = bsln_spec.y + hsw1 + upscale + approx_glyph_height
        mask_all = (
            (xmin <= all_endpoints[0])
            & (all_endpoints[0] < xmax)
            & (ymin_u <= all_endpoints[1])
            & (all_endpoints[1] < ymax_l)
        )
        endpoints = all_endpoints[:, mask_all]
        endpoints -= [[bsln_spec.x], [bsln_spec.y]]
        return (
            endpoints[:, endpoints[1] < -(hsw0 + upscale)],
            endpoints[:, hsw1 + upscale <= endpoints[1]],
        )

    a = np.deg2rad(stroke_angle)
    xform = np.array([[np.cos(a), np.cos(a)], [-np.sin(a), np.sin(a)]])
    xform_inv = np.linalg.inv(xform)

    all_endpoints_u = []
    all_endpoints_l = []
    for bsln_spec in baselines_spec:
        endpoints_u, endpoints_l = filter_in_baseline(all_endpoints, bsln_spec)
        all_endpoints_u.extend(
            [endpoints_u, endpoints_u + [[bsln_spec.length - 1], [0]]]
        )
        all_endpoints_l.extend(
            [endpoints_l, endpoints_l + [[bsln_spec.length - 1], [0]]]
        )
    all_endpoints_o_u = np.matmul(xform_inv, np.hstack(all_endpoints_u))
    all_endpoints_o_l = np.matmul(xform_inv, np.hstack(all_endpoints_l))

    def find_spacing():
        # upper limit for grid spacing; each word must contain at least one grid square
        bsln_min_length = np.quantile(
            [b.length for b in baselines_spec], 0.25, method="closest_observation"
        )
        spacing0 = xform_inv[0, 0] * bsln_min_length

        # assume spacing is at least `stroke_width`
        for spacing_div in range(1, math.ceil(spacing0 / stroke_width) + 1):
            spacing = spacing0 / spacing_div
            spacings = np.linspace(
                spacing - upscale, spacing + upscale, num=samples_per_check
            )
            fits_u_x, offsets_u_x = check_grid_fit(all_endpoints_o_u[0], spacings)
            fits_l_x, offsets_l_x = check_grid_fit(all_endpoints_o_l[0], spacings)
            fits_u_y, offsets_u_y = check_grid_fit(all_endpoints_o_u[1], spacings)
            fits_l_y, offsets_l_y = check_grid_fit(all_endpoints_o_l[1], spacings)
            fits_all = (fits_u_x + fits_l_x + fits_u_y + fits_l_y) / 4
            m = np.argmax(fits_all)
            if fits_all[m] > 0.8:
                return (
                    spacings[m],
                    np.array([offsets_u_x[m], offsets_u_y[m]]),
                    np.array([offsets_l_x[m], offsets_l_y[m]]),
                )

    spacing_o, offset_o_u, offset_o_l = find_spacing()

    def find_origin(all_endpoints_o, offset_o):
        gridpoints = np.int16(
            np.rint((all_endpoints_o - np.array(offset_o)[:, np.newaxis]) / spacing_o)
        )
        gp_pr_bl = gridpoints[0] - gridpoints[1]
        gp_pr_bl_min = np.min(gp_pr_bl)
        gp_pr_bl_max = np.max(gp_pr_bl)
        offset_n_counts, offset_n_edges = np.histogram(
            gp_pr_bl, bins=range(gp_pr_bl_min, max(gp_pr_bl_max, gp_pr_bl_min + 2) + 2)
        )  # ensure at least 3 bins
        offset_n_vals = offset_n_edges[:-1]
        offset_n_even_mask = offset_n_vals % 2 == 0
        max_i = np.argmax(
            np.convolve(offset_n_counts, [1, 1, 1], mode="same")[offset_n_even_mask]
        )
        offset_n = offset_n_vals[offset_n_even_mask][max_i] // 2
        return offset_o + [offset_n * spacing_o, offset_n * -spacing_o]

    offset_o_u = find_origin(all_endpoints_o_u, offset_o_u)
    offset_o_l = find_origin(all_endpoints_o_l, offset_o_l)

    grid1, grid2, offset_u, offset_l = np.matmul(
        xform, np.array([[spacing_o, 0], [0, spacing_o], offset_o_u, offset_o_l]).T
    ).T

    def refine_offset_x():
        vert_seg_x = np.concatenate(
            [
                np.hstack(
                    filter_in_baseline(
                        np.float64(segment_coords_raw_vert[0]), bsln_spec
                    )
                )[0]
                for bsln_spec in baselines_spec
            ]
        )
        if len(vert_seg_x) > 0:
            _fit, offset = check_grid_fit(vert_seg_x, grid1[0])
            return offset
        else:
            return np.nanmean([offset_u[0], offset_l[0]])

    offset_x = refine_offset_x()
    offset_u[0] = offset_x
    offset_l[0] = offset_x

    return grid1, grid2, offset_u, offset_l


LineSegmtSpec = tuple[tuple[float, float], tuple[float, float]]


class GlyphGeometryPod(typing.TypedDict):
    upscale: int
    stroke_width: int
    glyph_width: float
    glyph_template_shape: tuple[int, int]
    glyph_template_origin: tuple[int, int]
    all_lines: list[list[LineSegmtSpec]]
    circle_center: tuple[float, float]


@dataclass
class GlyphGeometry:
    upscale: int
    stroke_width: int
    glyph_width: float
    glyph_template_shape: tuple[int, int]
    glyph_template_origin: npt.NDArray[np.int32]
    all_lines: list[list[NDArray_f64]]
    circle_center: NDArray_f64

    def to_pod(self) -> GlyphGeometryPod:
        return GlyphGeometryPod(
            upscale=self.upscale,
            stroke_width=self.stroke_width,
            glyph_width=self.glyph_width,
            glyph_template_shape=self.glyph_template_shape,
            glyph_template_origin=tuple(map(int, self.glyph_template_origin)),
            all_lines=[
                [tuple(tuple(p) for p in l) for l in polyline]
                for polyline in self.all_lines
            ],
            circle_center=tuple(self.circle_center),
        )

    @classmethod
    def from_pod(cls, pod: GlyphGeometryPod):
        return cls(
            upscale=int(pod["upscale"]),
            stroke_width=int(pod["stroke_width"]),
            glyph_width=float(pod["glyph_width"]),
            glyph_template_shape=coerce_pair(pod["glyph_template_shape"], int),
            glyph_template_origin=np.array(
                coerce_pair(pod["glyph_template_origin"], int), dtype=np.int32
            ),
            all_lines=[
                [
                    np.array(
                        coerce_pair(l, lambda p: coerce_pair(p, float)),
                        dtype=np.float64,
                    )
                    for l in polyline
                ]
                for polyline in pod["all_lines"]
            ],
            circle_center=np.array(
                coerce_pair(pod["circle_center"], float), dtype=np.float64
            ),
        )


def make_all_lines(
    stroke_width: int,
    grid1,
    grid2,
    offset_u,
    offset_l,
    glyph_width: float,
    glyph_template_origin: NDArray_i32,
) -> tuple[list[list[NDArray_f64]], NDArray_f64]:
    pu00 = offset_u
    pu10 = pu00 + grid1
    pu01 = pu00 + grid2
    pu11 = pu00 + grid1 + grid2
    pl00 = offset_l
    pl10 = pl00 + grid1
    pl01 = pl00 + grid2
    pl11 = pl00 + grid1 + grid2
    all_lines = [
        # consonants
        [[pu01, pu11]],
        [[pu10, [pu10[0], 0]]],
        [[pu00, pu01]],
        [[pl00, pl10]],
        [[pu01, [pu01[0], 0]], [pl10, pl01]],
        [[pl10, pl11]],
        # vowels, ccw from top-right
        [[pu10, pu11]],
        [[pu00, pu10]],
        [[pu00, [pu00[0], 0]], [pl00 + [0, grid1[1]], pl00]],
        [[pl00, pl01]],
        [[pl01, pl11]],
        # bottom circle
        [],
        # baseline
        [[[0.0, 0.0], [glyph_width, 0]]],
    ]
    circle_center = pl01 + [0, stroke_width]
    return (
        [
            [np.array([(p + glyph_template_origin) for p in l]) for l in polyline]
            for polyline in all_lines
        ],
        circle_center + glyph_template_origin,
    )


def make_template(g: GlyphGeometry):
    glyph_template_uint8 = np.zeros((13, *g.glyph_template_shape), dtype=np.uint8)
    for canvas, polyline in zip(glyph_template_uint8, g.all_lines):
        cv2.polylines(
            canvas,
            [np.int32(2**16 * o) for o in polyline],
            False,
            255,
            thickness=g.stroke_width,
            lineType=cv2.LINE_AA,
            shift=16,
        )
    cv2.circle(
        glyph_template_uint8[-2],
        np.int32(2**16 * g.circle_center),
        2**16 * (g.stroke_width - 1),
        255,
        thickness=g.stroke_width - 1,
        lineType=cv2.LINE_AA,
        shift=16,
    )
    glyph_template = np.float32(glyph_template_uint8) / 255
    for canvas in glyph_template:
        cv2.GaussianBlur(canvas, (3, 3), 0, dst=canvas)

    template_overlap_uint8 = np.zeros(g.glyph_template_shape, dtype=np.uint8)
    cv2.polylines(
        template_overlap_uint8,
        [
            np.int32(2**16 * (o + [g.glyph_width, 0]))
            for lines in g.all_lines
            for o in lines
        ],
        False,
        255,
        thickness=g.stroke_width,
        lineType=cv2.LINE_AA,
        shift=16,
    )
    cv2.polylines(
        template_overlap_uint8,
        [
            np.int32(2**16 * (o - [g.glyph_width, 0]))
            for lines in g.all_lines
            for o in lines
        ],
        False,
        255,
        thickness=g.stroke_width,
        lineType=cv2.LINE_AA,
        shift=16,
    )
    template_overlap = np.float32(template_overlap_uint8) / 255
    cv2.GaussianBlur(template_overlap, (3, 3), 0, dst=template_overlap)

    glyph_template_mask = glyph_template != 0

    def make_glyph_template_base():
        all_glyphs = np.max(glyph_template[:-1], axis=0)
        glyph_template_base = -all_glyphs
        glyph_template_base[glyph_template_mask[-1]] = glyph_template[-1][
            glyph_template_mask[-1]
        ]
        template_overlap_mask = template_overlap > 0
        glyph_template_base[template_overlap_mask] = np.fmax(
            glyph_template_base[template_overlap_mask], 0
        )
        return glyph_template_base

    return (
        glyph_template[:-1],
        glyph_template_mask[:-1],
        make_glyph_template_base(),
    )


def fit_glyphs(
    upscale: int,
    stroke_width: int,
    strokes_f: NDArray_f32,
    glyph_template_shape: tuple[float, float],
    glyph_template_origin,
    glyph_template,
    glyph_template_mask,
    glyph_template_base,
    glyph_origins,
):
    def gen_next_templates(templates_strokes, templates_data, popcount):
        # assert len(templates_strokes.shape) == 2
        # assert templates_strokes.shape[0] == templates_data.shape[0]

        stack_len = templates_strokes.shape[0]
        expand_n = len(glyph_template) - popcount

        _a, nonzeros = np.nonzero(~templates_strokes)
        # assert np.all(_a.reshape(stack_len, expand_n) == np.arange(stack_len)[:, np.newaxis])
        stroke_is = nonzeros.reshape(stack_len, expand_n)
        next_templates_strokes = np.repeat(
            templates_strokes[:, np.newaxis, :], expand_n, axis=1
        )
        next_templates_data = np.repeat(
            templates_data[:, np.newaxis, :, :], expand_n, axis=1
        )
        np.put_along_axis(
            next_templates_strokes, stroke_is[:, :, np.newaxis], True, axis=-1
        )
        mask = glyph_template_mask[stroke_is]
        next_templates_data[mask] = np.fmax(
            next_templates_data[mask], glyph_template[stroke_is][mask]
        )
        return next_templates_strokes, next_templates_data

    def np_index_par(a, indices, axis):
        return a[*np.ix_(*[np.arange(a.shape[i]) for i in range(axis)]), indices]

    all_template_offsets = (
        np.dstack(np.mgrid[: upscale * 2 + 1, : upscale * 2 + 1]).reshape(-1, 2)
        - upscale
    )

    def check_template(glyphs_all_offsets, templates_data):
        # what fresh dimensional hell have i created
        # assert len(glyphs_all_offsets.shape) == 4
        # assert len(templates_data.shape) == 4
        # assert glyphs_all_offsets.shape[0] == templates_data.shape[0]

        tmpl_dt_max0 = np.fmax(templates_data, 0)
        best_offsets_i = np.argmax(
            np.einsum("mikl,mjkl->mji", glyphs_all_offsets, tmpl_dt_max0), axis=-1
        )
        best_offsets = np.take(all_template_offsets, best_offsets_i, axis=0)
        glyphs = np_index_par(glyphs_all_offsets[:, np.newaxis], best_offsets_i, axis=2)
        # glyphs1 = np.squeeze(np.take_along_axis(glyphs_all_offsets[:, np.newaxis, :, :, :], best_offsets_i[:, :, np.newaxis, np.newaxis, np.newaxis], axis=2), axis=2)
        # assert np.array_equal(glyphs, glyphs1)
        return (
            np.einsum("mijk,mijk->mi", glyphs, templates_data)
            / np.sum(tmpl_dt_max0, axis=(-2, -1)),
            best_offsets,
        )

    strokes_bordered = cv2.copyMakeBorder(
        strokes_f,
        stroke_width,
        stroke_width,
        stroke_width,
        stroke_width,
        cv2.BORDER_CONSTANT,
        value=0,
    )

    def glyph_slice_par(offsets):
        offsets = offsets + [stroke_width, stroke_width]
        return [
            strokes_bordered[offset[1] :, offset[0] :][
                : glyph_template_shape[0], : glyph_template_shape[1]
            ]
            for offset in offsets
        ]

    glyphs_all_offsets = np.array(
        [
            glyph_slice_par(
                all_template_offsets + (glyph_origin - glyph_template_origin)
            )
            for glyph_origin in glyph_origins
        ],
        dtype=np.float32,
    )
    current_templates_strokes = np.zeros(
        (len(glyph_origins), len(glyph_template)), dtype=np.bool_
    )
    current_templates_data = np.repeat(
        glyph_template_base[np.newaxis, ...], len(glyph_origins), axis=0
    )
    current_fit, current_offset = check_template(
        glyphs_all_offsets, current_templates_data[:, np.newaxis]
    )
    current_fit = np.squeeze(current_fit, axis=1)
    current_offset = np.squeeze(current_offset, axis=1)
    active_mask = np.full(len(glyph_origins), True, dtype=np.bool_)

    for i in range(len(glyph_template)):
        next_templates_strokes, next_templates_data = gen_next_templates(
            current_templates_strokes[active_mask],
            current_templates_data[active_mask],
            i,
        )
        fits, offsets = check_template(
            glyphs_all_offsets[active_mask], next_templates_data
        )
        next_i = np.argmax(fits, axis=-1)
        next_active_mask = active_mask[active_mask] & (
            np_index_par(fits, next_i, axis=1) > current_fit[active_mask]
        )
        if not np.any(next_active_mask):
            break

        active_mask[active_mask] = next_active_mask
        current_templates_strokes[active_mask] = np_index_par(
            next_templates_strokes, next_i, axis=1
        )[next_active_mask]
        current_templates_data[active_mask] = np_index_par(
            next_templates_data, next_i, axis=1
        )[next_active_mask]
        current_fit[active_mask] = np_index_par(fits, next_i, axis=1)[next_active_mask]
        current_offset[active_mask] = np_index_par(offsets, next_i, axis=1)[
            next_active_mask
        ]
        yield i

    return current_templates_strokes, current_offset + glyph_origins


def mk_circle(diameter: int) -> NDArray_u8:
    return np.uint8(
        np.hypot(*np.ogrid[1 - diameter : diameter : 2, 1 - diameter : diameter : 2])
        < diameter
    )


def mk_rect(x: int, y: int) -> NDArray_u8:
    return np.ones((y, x), dtype=np.uint8)


def cv2_cc_get_roi(cc_stats: np.ndarray, i: int):
    x = cc_stats[i, cv2.CC_STAT_LEFT]
    y = cc_stats[i, cv2.CC_STAT_TOP]
    w = cc_stats[i, cv2.CC_STAT_WIDTH]
    h = cc_stats[i, cv2.CC_STAT_HEIGHT]
    return (slice(y, y + h), slice(x, x + w))


def cv_rect_to_roi(r):
    return (slice(r[1], r[1] + r[3]), slice(r[0], r[0] + r[2]))


# fourier tranform, sort of
def check_grid_fit(points, spacings):
    assert len(points.shape) == 1
    spacings = np.asarray(spacings)
    f = (1 / spacings)[np.newaxis, ...]
    p = points.reshape(*points.shape, *((1,) * len(spacings.shape)))
    ft = np.sum(np.exp((2j * np.pi * f) * p), axis=0)
    return np.abs(ft) / points.size, np.angle(ft) * (spacings / (2 * np.pi))


def coerce_pair[T, U](p: tuple[U, U], ty: typing.Callable[[U], T]) -> tuple[T, T]:
    a, b = p
    return (ty(a), ty(b))
