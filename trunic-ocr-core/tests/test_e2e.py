from pathlib import Path

import numpy as np
import pytest
import trunic_ocr_core as ocr

# all input images cropped from the Tunic manual
test_inputs_dir = Path(__file__).parent.joinpath("inputs")


@pytest.fixture
def ocr_input(golden):
    img_data = test_inputs_dir.joinpath(golden["input"]["filename"]).read_bytes()
    assert type(golden["input"]["lax"]) is bool
    return ocr.decodeImage(np.frombuffer(img_data, dtype=np.uint8))


@pytest.mark.golden_test("goldens/*.yml")
def test_ocr_e2e(golden, ocr_input):
    ocr_gen = GeneratorWrapper(ocr.findGlyphs(ocr_input, lax=golden["input"]["lax"]))
    for i, v in zip(range(1, 13), ocr_gen, strict=True):
        assert i == v

    (
        strokes_bordered,
        glyph_geometry,
        glyph_templates,
        glyph_origins_raw,
    ) = ocr_gen.value

    ocr_glyphs_gen = ocr.fitGlyphs(
        strokes_bordered, glyph_geometry, glyph_templates, glyph_origins_raw
    )

    output_glyphs = [
        {
            "origin": list(v["origin"]),
            "strokes": unpack_strokes(v["strokes"]),
        }
        for v in ocr_glyphs_gen
    ]
    assert output_glyphs == golden.out["output"]


def unpack_strokes(strokes_arr):
    return "".join(
        str(int(x))
        for x in np.unpackbits(
            np.asarray(strokes_arr, dtype=np.uint8), bitorder="little", count=12
        )
    )


# https://stackoverflow.com/a/34073559
class GeneratorWrapper:
    def __init__(self, gen):
        self.gen = gen

    def __iter__(self):
        self.value = yield from self.gen
        return self.value
