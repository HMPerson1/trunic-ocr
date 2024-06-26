import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { loadPyodide } from 'pyodide';
import type { PyBuffer } from 'pyodide/ffi';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'trunic-ocr';
  constructor() {
    const pyodide = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/", packages: ["numpy", "opencv-python"] });
    const pypkgPromise = fetch("trunic_ocr_core-0.1.0-py3-none-any.whl");
    (async () => {
      const py = await pyodide;
      performance.mark("pyodide loaded");

      py.unpackArchive(await (await pypkgPromise).arrayBuffer(), 'wheel');
      const pypkg = py.pyimport('trunic_ocr_core');
      performance.mark("python pkg loaded");
      const test_img = new Uint8Array(100)
      test_img[44] = 1
      const pyout = pypkg.test(py.toPy(test_img), 10, 10) as PyBuffer
      const data = pyout.getBuffer().data.slice();
      console.log(data);
      performance.mark("done");
    })();
  }
}
