import numpy as np
import numpy.typing as npt
import cv2

def test(img: memoryview, width: int, height: int) -> npt.NDArray[np.uint8]:
    return cv2.dilate(np.asarray(img).reshape(height, width), mk_circle(5))


def mk_circle(diameter: int) -> npt.NDArray[np.uint8]:
    return np.uint8(np.hypot(*np.ogrid[1-diameter:diameter:2, 1-diameter:diameter:2]) < diameter)


def mk_rect(x: int, y: int) -> npt.NDArray[np.uint8]:
    return np.ones((y, x), dtype=np.uint8)
