from typing import Any

import cv2
import numpy as np
import numpy.typing as npt


def decodeImage(imgData: memoryview) -> npt.NDArray[np.uint8]:
    return cv2.imdecode(np.asarray(imgData), cv2.IMREAD_COLOR)


# assumes input is from `decodeImage`
def image2Rgba(img: npt.NDArray[np.uint8]) -> npt.NDArray[np.uint8]:
    return np.ascontiguousarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGBA))


def loadBitmap(bmpData: memoryview, width: int, height: int) -> npt.NDArray[np.uint8]:
    return np.asarray(bmpData).reshape(height, width, 4)


def preprocess(img: npt.NDArray[np.uint8]):
    isBgr = img.shape[2] == 3
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY if isBgr else cv2.COLOR_RGBA2GRAY)
    return cv2.resize(gray, None, None, 3, 3, cv2.INTER_CUBIC)


def mk_circle(diameter: int) -> npt.NDArray[np.uint8]:
    return np.uint8(
        np.hypot(*np.ogrid[1 - diameter : diameter : 2, 1 - diameter : diameter : 2])
        < diameter
    )


def mk_rect(x: int, y: int) -> npt.NDArray[np.uint8]:
    return np.ones((y, x), dtype=np.uint8)
