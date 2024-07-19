from typing import Any

import cv2
import numpy as np
import numpy.typing as npt


def decodeImage(imgData: memoryview) -> npt.NDArray[Any]:
    return cv2.imdecode(np.asarray(imgData), cv2.IMREAD_COLOR)


def image2Rgba(img: npt.NDArray[Any]) -> npt.NDArray[np.uint8]:
    return np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGBA))


def mk_circle(diameter: int) -> npt.NDArray[np.uint8]:
    return np.uint8(
        np.hypot(*np.ogrid[1 - diameter : diameter : 2, 1 - diameter : diameter : 2])
        < diameter
    )


def mk_rect(x: int, y: int) -> npt.NDArray[np.uint8]:
    return np.ones((y, x), dtype=np.uint8)
